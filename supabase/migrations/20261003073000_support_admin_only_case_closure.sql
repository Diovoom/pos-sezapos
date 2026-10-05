-- Support case resolution/closure is controlled by SEZA platform support staff.
-- Merchant clients may continue reading/replying to cases, including replying to
-- a resolved/closed case to reopen it through the supported reply workflow.

DO $$
BEGIN
  IF to_regprocedure('public.merchant_close_support_case(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.merchant_close_support_case(uuid) FROM authenticated;
    COMMENT ON FUNCTION public.merchant_close_support_case(uuid) IS
      'Legacy merchant closure RPC. Execution is revoked from merchant-authenticated clients; SEZA Admin owns support case resolution and closure.';
  END IF;
END
$$;
