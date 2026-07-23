ALTER TABLE lessons
  DROP CONSTRAINT IF EXISTS lessons_financial_status_check;

ALTER TABLE lessons
  ADD CONSTRAINT lessons_financial_status_check
  CHECK (financial_status IN ('unposted', 'legacy', 'pending', 'posted', 'reversed'));
