//! 进程生命周期测试：CLI 用法错误码、`--scenario` 只走 CLI（ENV-002）、seed 稳定性、
//! 两段式优雅关停与无遗留进程。

mod common;

use std::process::Command;
use std::time::Duration;

use common::*;

fn mock_binary() -> &'static str {
    env!("CARGO_BIN_EXE_mock")
}

fn run_cli(args: &[&str]) -> (i32, String, String) {
    let output = Command::new(mock_binary())
        .args(args)
        .output()
        .expect("run mock binary");
    (
        output.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
    )
}

#[test]
fn unknown_scenario_is_a_usage_error_with_exit_code_10() {
    let (code, stdout, stderr) = run_cli(&["--listen", "127.0.0.1:0", "--scenario", "chaos"]);
    assert_eq!(code, 10, "exit code must be 10, stdout: {stdout}");
    assert!(stdout.is_empty(), "usage errors go to stderr: {stdout}");
    assert!(stderr.starts_with("[mock] usage:"), "{stderr}");
    assert!(stderr.contains("unknown scenario 'chaos'"), "{stderr}");
    // 列出全部合法值，便于纠正。
    for name in [
        "default",
        "empty",
        "slow",
        "server-error",
        "malformed-response",
    ] {
        assert!(stderr.contains(name), "{stderr} must list {name}");
    }
}

#[test]
fn cli_rejects_unknown_options_and_prints_help_on_request() {
    let (code, _stdout, stderr) = run_cli(&["--web-port", "5173"]);
    assert_eq!(code, 10, "{stderr}");
    assert!(stderr.contains("unknown option '--web-port'"), "{stderr}");

    let (code, _stdout, stderr) = run_cli(&["--listen", "0.0.0.0:9090"]);
    assert_eq!(code, 10);
    assert!(stderr.contains("loopback"), "{stderr}");

    let (code, stdout, _stderr) = run_cli(&["--help"]);
    assert_eq!(code, 0, "{stdout}");
    for expected in [
        "--scenario",
        "--listen",
        "default",
        "server-error",
        "X-Blog-Mock-Session",
    ] {
        assert!(
            stdout.contains(expected),
            "help must mention {expected}: {stdout}"
        );
    }

    // 缺省启动形态（无参数）也是合法的：绑定默认候选端口 9090 的进程立刻被杀掉。
    let mut child = Command::new(mock_binary())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .expect("spawn mock with defaults");
    std::thread::sleep(Duration::from_millis(300));
    let _ = child.kill();
    let _ = child.wait();
}

#[test]
fn scenario_is_only_selected_through_the_cli() {
    // ENV-002：环境里的 SCENARIO 类变量不生效，缺省仍是 default。
    let mut server = Server::start_with_env(
        &["--listen", "127.0.0.1:0"],
        &[("SCENARIO", "empty"), ("BLOG_SCENARIO", "empty")],
    );
    let startup = server.lines();
    assert!(
        startup.iter().any(|line| line.contains("scenario=default")),
        "environment must not select the scenario: {startup:?}"
    );
    assert_eq!(
        get(server.port, &public_list(100)).data()["total"],
        45,
        "default seed served"
    );
    let status = server.signal("-TERM");
    assert!(status.success());

    // 显式 CLI 参数生效。
    let mut server = Server::start(&["--listen", "127.0.0.1:0", "--scenario", "empty"]);
    let startup = server.lines();
    assert!(startup.iter().any(|line| line.contains("scenario=empty")));
    assert_eq!(get(server.port, &public_list(100)).data()["total"], 0);
    let _ = server.signal("-TERM");
}

#[test]
fn seed_is_stable_across_two_starts() {
    // 同一场景两次启动（两个独立进程）必须产出完全一致的数据：前端在两次
    // runtime 启动之间看到的 id、标题与顺序都不变。
    let paths = [
        "/api/public/articles?sceneCode=public.article_list&pageSize=100",
        "/api/public/article-types?sceneCode=public.article_type_list",
        "/api/public/terms?sceneCode=public.term_list",
        "/api/public/recommendations?sceneCode=public.recommendation_current",
        "/api/public/mobile/article-shelf?sceneCode=public.mobile_article_shelf",
        "/api/admin/articles?sceneCode=admin.article_list",
    ];
    let mut first_bodies: Vec<String> = Vec::new();
    {
        let mut server = Server::start(&["--listen", "127.0.0.1:0", "--scenario", "default"]);
        for path in paths {
            first_bodies.push(get(server.port, path).body);
        }
        let _ = server.signal("-TERM");
    }
    let mut second_server = Server::start(&["--listen", "127.0.0.1:0", "--scenario", "default"]);
    for (path, first) in paths.iter().zip(first_bodies.iter()) {
        let second = get(second_server.port, path).body;
        assert_eq!(&second, first, "seed drifted for {path}");
    }
    assert!(
        first_bodies[0].contains("\"total\":45"),
        "bodies are non-trivial"
    );
    let _ = second_server.signal("-TERM");
}

#[test]
fn graceful_shutdown_is_two_phase_for_sigint_and_sigterm() {
    for (signal, name) in [("-INT", "SIGINT"), ("-TERM", "SIGTERM")] {
        let mut server = Server::start(&["--listen", "127.0.0.1:0", "--scenario", "default"]);
        let port = server.port;
        assert!(get(port, "/healthz").status == 200);

        let status = server.signal(signal);
        assert!(
            status.success(),
            "{name}: clean exit expected, got {status:?}"
        );

        // 关停顺序可从日志读出，且没有"排空超时"（限时只在信号之后起算）。
        server.wait_for_line("shutdown complete", Duration::from_secs(5));
        let lines = server.lines();
        let position = |needle: &str| {
            lines
                .iter()
                .position(|line| line.contains(needle))
                .unwrap_or_else(|| panic!("missing log line containing '{needle}'"))
        };
        let received = position(&format!("signal received signal={name}"));
        let stop_accept = position("phase=1 stop accept");
        let drained = position("phase=2 in-flight requests drained");
        let complete = position("shutdown complete");
        assert!(received < stop_accept, "{lines:?}");
        assert!(stop_accept < drained, "{lines:?}");
        assert!(drained < complete, "{lines:?}");
        assert!(
            !lines
                .iter()
                .any(|line| line.contains("drain budget exceeded")),
            "the drain budget must not start before the signal: {lines:?}"
        );
        assert!(
            lines.iter().any(|line| line.contains("scenario=default")),
            "shutdown summary carries the scenario: {lines:?}"
        );
    }
}

#[test]
fn restart_reinitializes_all_state() {
    // 同一进程内跨请求的状态，在进程重启后不残留（PLAN：每次启动重新初始化）。
    let mut first = Server::start(&["--listen", "127.0.0.1:0", "--scenario", "default"]);
    let port = first.port;
    let response = post(
        port,
        "/api/admin/articles",
        &article_body(
            "admin.article_create",
            r#""title":"temporary","summary":"s""#,
        ),
        Some("t1"),
    );
    assert_eq!(response.status, 200);
    assert_eq!(
        get_with(port, &admin_list(), Some("t1")).data()["total"],
        49
    );
    let _ = first.signal("-TERM");

    let mut second = Server::start(&["--listen", "127.0.0.1:0", "--scenario", "default"]);
    assert_eq!(
        get_with(second.port, &admin_list(), Some("t1")).data()["total"],
        48,
        "the session must start from the seed again"
    );
    assert_eq!(
        get_with(second.port, &public_list(100), Some("t1")).data()["total"],
        45
    );
    let _ = second.signal("-TERM");
}
