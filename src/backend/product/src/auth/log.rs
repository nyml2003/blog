use std::{fmt, net::IpAddr};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthEventKind {
    Login,
    RateLimit,
    Logout,
    Configuration,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthOutcome {
    Success,
    Denied,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthReason {
    None,
    InvalidCredentials,
    TotpReplay,
    Cooldown,
    MissingConfiguration,
    InvalidConfiguration,
    PersistenceFailure,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AuthEvent {
    pub kind: AuthEventKind,
    pub outcome: AuthOutcome,
    pub reason: AuthReason,
    pub client_ip: Option<IpAddr>,
}

impl fmt::Display for AuthEvent {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "event={} outcome={} reason={}",
            kind_name(self.kind),
            outcome_name(self.outcome),
            reason_name(self.reason),
        )?;
        if let Some(ip) = self.client_ip {
            write!(formatter, " client_ip={ip}")?;
        }
        Ok(())
    }
}

fn kind_name(value: AuthEventKind) -> &'static str {
    match value {
        AuthEventKind::Login => "admin_auth_login",
        AuthEventKind::RateLimit => "admin_auth_rate_limit",
        AuthEventKind::Logout => "admin_auth_logout",
        AuthEventKind::Configuration => "admin_auth_configuration",
    }
}

fn outcome_name(value: AuthOutcome) -> &'static str {
    match value {
        AuthOutcome::Success => "success",
        AuthOutcome::Denied => "denied",
        AuthOutcome::Unavailable => "unavailable",
    }
}

fn reason_name(value: AuthReason) -> &'static str {
    match value {
        AuthReason::None => "none",
        AuthReason::InvalidCredentials => "invalid_credentials",
        AuthReason::TotpReplay => "totp_replay",
        AuthReason::Cooldown => "cooldown",
        AuthReason::MissingConfiguration => "missing_configuration",
        AuthReason::InvalidConfiguration => "invalid_configuration",
        AuthReason::PersistenceFailure => "persistence_failure",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_format_has_only_fixed_fields() {
        let event = AuthEvent {
            kind: AuthEventKind::Login,
            outcome: AuthOutcome::Denied,
            reason: AuthReason::InvalidCredentials,
            client_ip: Some("127.0.0.1".parse().unwrap()),
        };
        assert_eq!(
            event.to_string(),
            "event=admin_auth_login outcome=denied reason=invalid_credentials client_ip=127.0.0.1"
        );
    }
}
