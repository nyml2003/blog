//! Mock Product API 进程入口；全部逻辑在库 target（`mock::server`），便于集成测试复用。

fn main() -> std::process::ExitCode {
    match mock::Cli::parse(std::env::args().skip(1)) {
        Ok(cli) => mock::run(cli),
        Err(mock::CliError::Help(text)) => {
            println!("{text}");
            std::process::ExitCode::SUCCESS
        }
        Err(mock::CliError::Usage(message)) => {
            mock::mock_error!("usage: {message}");
            std::process::ExitCode::from(mock::EXIT_USAGE)
        }
    }
}
