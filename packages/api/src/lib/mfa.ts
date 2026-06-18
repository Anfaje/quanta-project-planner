/**
 * Whether two-factor authentication is enforced across the auth flows
 * (direct signup, login, and invite acceptance).
 *
 * Disabled by setting MFA_ENABLED=false — used to test core functionality
 * end-to-end without the TOTP step. Defaults to ENABLED, so the test suite
 * and any deployment that doesn't set the flag keep 2FA on; the "off" state
 * is therefore always an explicit, visible choice (see packages/api/fly.toml).
 *
 * This is a temporary off-switch. Re-enabling it is tracked in GitHub issue #1;
 * when MFA is hardened, set MFA_ENABLED=true (or remove the flag) and delete
 * the disabled-path branches in routes/auth.ts and routes/invites.ts.
 */
export const mfaEnabled = (): boolean => process.env.MFA_ENABLED !== "false";
