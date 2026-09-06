//! Data Server 进程入口；全部逻辑在库 target（`data::server`），便于集成测试复用。

fn main() -> std::process::ExitCode {
    match data::cli::Cli::parse(std::env::args().skip(1)) {
        Ok(cli) => data::server::run(cli),
        Err(data::cli::CliError::Help(text)) => {
            println!("{text}");
            std::process::ExitCode::SUCCESS
        }
        Err(data::cli::CliError::Usage(message)) => {
            data::data_error!("usage: {message}");
            std::process::ExitCode::from(data::cli::EXIT_USAGE)
        }
    }
}
