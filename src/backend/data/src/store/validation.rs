//! Data-owned validation that depends on the current taxonomy state.

use protocol::envelope::codes;
use protocol::{ArticleBrowseQuery, OperationFailure};

/// Validate that browse term ids exist and belong to the requested dimensions.
pub(super) fn browse_term_kind_failure<'a>(
    query: &ArticleBrowseQuery,
    kind_of: impl Fn(i64) -> Option<&'a str>,
) -> Option<OperationFailure> {
    for (term_id, expected_kind) in query.term_dimensions() {
        let failure = match kind_of(term_id) {
            None => OperationFailure::new(
                codes::INVALID_PAYLOAD,
                format!("{expected_kind} term {term_id} not found"),
            ),
            Some(kind) if kind != expected_kind => OperationFailure::new(
                codes::INVALID_PAYLOAD,
                format!("term {term_id} has kind '{kind}', expected '{expected_kind}'"),
            ),
            Some(_) => continue,
        };
        return Some(failure);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browse_validation_preserves_the_public_failure_messages() {
        let query = ArticleBrowseQuery {
            topic_id: Some(7),
            tag_id: Some(8),
            ..ArticleBrowseQuery::default()
        };
        let missing = browse_term_kind_failure(&query, |_| None).unwrap();
        assert_eq!(missing.code, codes::INVALID_PAYLOAD);
        assert_eq!(missing.message, "topic term 7 not found");

        let wrong_kind = browse_term_kind_failure(&query, |id| match id {
            7 => Some("tag"),
            _ => None,
        })
        .unwrap();
        assert_eq!(wrong_kind.code, codes::INVALID_PAYLOAD);
        assert_eq!(
            wrong_kind.message,
            "term 7 has kind 'tag', expected 'topic'"
        );
    }
}
