DROP TRIGGER IF EXISTS tg_support_tickets_assign_number ON public.support_tickets;

ALTER TABLE public.support_tickets
  ALTER COLUMN ticket_number
  SET DEFAULT nextval('public.support_tickets_ticket_number_seq'::regclass);

SELECT setval(
  'public.support_tickets_ticket_number_seq',
  COALESCE((SELECT MAX(ticket_number) FROM public.support_tickets), 0) + 1,
  false
);
