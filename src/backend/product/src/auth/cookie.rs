use std::net::IpAddr;

use super::session::well_formed_token;

pub const ADMIN_SESSION_COOKIE: &str = "blog_admin_session";

/// Request transport facts after the HTTP adapter has authenticated any reverse proxy and parsed
/// its forwarding headers. Core code never decides that a loopback peer is automatically trusted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VerifiedRequestOrigin {
    client_ip: IpAddr,
    secure: bool,
    via_trusted_proxy: bool,
}

impl VerifiedRequestOrigin {
    pub fn direct(client_ip: IpAddr, secure: bool) -> Self {
        Self {
            client_ip,
            secure,
            via_trusted_proxy: false,
        }
    }

    /// The adapter may call this only after the socket peer matched the configured trusted-proxy
    /// address set and its structured forwarding headers were validated.
    pub fn from_trusted_proxy(client_ip: IpAddr, forwarded_secure: bool) -> Self {
        Self {
            client_ip,
            secure: forwarded_secure,
            via_trusted_proxy: true,
        }
    }

    pub fn client_ip(self) -> IpAddr {
        self.client_ip
    }

    pub fn secure(self) -> bool {
        self.secure
    }

    pub fn via_trusted_proxy(self) -> bool {
        self.via_trusted_proxy
    }
}

pub fn session_cookie(
    token: &str,
    origin: VerifiedRequestOrigin,
    max_age_seconds: u64,
) -> Option<String> {
    if !well_formed_token(token) || max_age_seconds == 0 {
        return None;
    }
    Some(format!(
        "{ADMIN_SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age_seconds}{}",
        secure_suffix(origin.secure()),
    ))
}

pub fn clear_session_cookie(origin: VerifiedRequestOrigin) -> String {
    format!(
        "{ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0{}",
        secure_suffix(origin.secure()),
    )
}

pub fn extract_session_cookie(header: &str) -> Option<&str> {
    header.split(';').find_map(|part| {
        let (name, value) = part.trim().split_once('=')?;
        (name == ADMIN_SESSION_COOKIE && well_formed_token(value)).then_some(value)
    })
}

pub fn safe_admin_next(path_and_query: &str) -> Option<String> {
    let path = path_and_query.split('?').next().unwrap_or(path_and_query);
    let lowercase = path_and_query.to_ascii_lowercase();
    let valid = (path == "/admin" || path.starts_with("/admin/"))
        && path != "/admin/login.html"
        && !path_and_query.contains(['\r', '\n', '\\'])
        && !lowercase.contains("%5c")
        && !path_and_query.starts_with("//");
    valid.then(|| percent_encode_query_value(path_and_query))
}

fn secure_suffix(secure: bool) -> &'static str {
    if secure { "; Secure" } else { "" }
}

fn percent_encode_query_value(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            encoded.push(byte as char);
        } else {
            encoded.push('%');
            encoded.push(
                char::from_digit(u32::from(byte >> 4), 16)
                    .unwrap()
                    .to_ascii_uppercase(),
            );
            encoded.push(
                char::from_digit(u32::from(byte & 0x0f), 16)
                    .unwrap()
                    .to_ascii_uppercase(),
            );
        }
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

    #[test]
    fn proxy_trust_is_an_adapter_fact_not_a_loopback_heuristic() {
        let loopback = "127.0.0.1".parse().unwrap();
        let direct = VerifiedRequestOrigin::direct(loopback, false);
        assert!(!direct.via_trusted_proxy());
        assert!(!direct.secure());

        let forwarded =
            VerifiedRequestOrigin::from_trusted_proxy("198.51.100.7".parse().unwrap(), true);
        assert!(forwarded.via_trusted_proxy());
        assert!(forwarded.secure());
        assert_eq!(
            forwarded.client_ip(),
            "198.51.100.7".parse::<IpAddr>().unwrap()
        );
    }

    #[test]
    fn cookie_uses_the_session_store_ttl_supplied_by_the_caller() {
        let plain = session_cookie(
            TOKEN,
            VerifiedRequestOrigin::direct("127.0.0.1".parse().unwrap(), false),
            1234,
        )
        .unwrap();
        assert!(plain.contains("HttpOnly; SameSite=Strict; Max-Age=1234"));
        assert!(!plain.contains("Secure"));
        assert!(
            session_cookie(
                "bad",
                VerifiedRequestOrigin::direct("127.0.0.1".parse().unwrap(), true),
                1234,
            )
            .is_none()
        );
        assert!(
            clear_session_cookie(VerifiedRequestOrigin::from_trusted_proxy(
                "198.51.100.7".parse().unwrap(),
                true,
            ))
            .ends_with("; Secure")
        );
    }

    #[test]
    fn next_is_limited_to_safe_admin_paths_and_encoded_for_a_query() {
        assert_eq!(safe_admin_next("/admin"), Some("%2Fadmin".to_owned()));
        assert_eq!(
            safe_admin_next("/admin/editor.html?id=1"),
            Some("%2Fadmin%2Feditor.html%3Fid%3D1".to_owned())
        );
        assert_eq!(safe_admin_next("/admin/login.html"), None);
        assert_eq!(safe_admin_next("//evil.example/admin/"), None);
        assert_eq!(safe_admin_next("/admin/%5cevil"), None);
    }
}
