# GCML approvals required before production

The SRS labels the following as open decisions. The application deliberately avoids presenting them as approved policy.

1. **Minimum age and youth consent/routing policy** — GCML leadership, safeguarding lead, and qualified legal adviser.
2. **Six-stage milestone dictionary and completion formula** — product/ministry owner. The current UI says “path viewed,” not authoritative spiritual-growth completion.
3. **Pending-request expiry window and counselor coverage** — ministry operations owner.
4. **Retention periods by data class, backup expiry, and legal holds** — data owner, legal adviser, and safeguarding lead.
5. **Private-mode recovery and credential-loss behavior** — product owner and security lead.
6. **Offline message storage policy** — security/privacy owner. This build does not intentionally cache message content for offline use.
7. **End-to-end encryption decision** — technical/security owner. This build does not claim E2EE.
8. **Safeguarding staffing, monitoring hours, and response-time promises** — safeguarding lead.
9. **Pilot targets and “substantive engagement” definition** — product/ministry owner.
10. **Jurisdiction-specific privacy, child-protection, mandatory-reporting, and cross-border processing requirements** — qualified legal adviser.
11. **Approved Bible translation and content licensing** — ministry/content owner and legal adviser.
12. **Production origin allowlist and deployment region** — technical and data-protection owners.

## Blueprint conflict decisions

- The PPT’s term “Ghost mode” is displayed as **Private mode**, matching SRS v3.0. The interface explains its limits and does not promise anonymity.
- The canonical journey uses the SRS stages: **Come, Connect, Counsel, Follow Up, Disciple, Grow**.
- Administrator access does not imply conversation access. Safeguarding concern review remains a separately permissioned responsibility.
- The PPT’s percentage is represented as a non-authoritative path-view indicator until GCML approves milestones and formulas.
