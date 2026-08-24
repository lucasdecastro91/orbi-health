-- Follow-up flag for leads (CRM) — marks a lead as needing a follow-up nudge
-- independent of its pipeline stage (a lead can need follow-up after
-- contato_feito, call_agendada or proposta_enviada — it's not a fixed stage).
alter table public.leads
  add column follow_up_at timestamptz;
