
-- Payroll & schedule fields on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hourly_wage numeric(10,2),
  ADD COLUMN IF NOT EXISTS scheduled_start_time text,
  ADD COLUMN IF NOT EXISTS scheduled_end_time text,
  ADD COLUMN IF NOT EXISTS late_threshold_minutes integer NOT NULL DEFAULT 5;

-- Late-tracking & manager-override columns on time_entries
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS late boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS override_reason text;

-- Compute late on clock-in based on scheduled_start_time.
CREATE OR REPLACE FUNCTION public.tg_time_entries_compute_late()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sched text;
  v_threshold int;
  v_tz text;
  v_now_local timestamp;
  v_sched_local timestamp;
  v_diff_min int;
BEGIN
  SELECT scheduled_start_time, late_threshold_minutes
    INTO v_sched, v_threshold
    FROM public.profiles WHERE id = NEW.user_id;

  IF v_sched IS NULL OR v_sched = '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(time_zone, 'UTC') INTO v_tz
    FROM public.stores WHERE id = NEW.store_id;
  IF v_tz IS NULL THEN v_tz := 'UTC'; END IF;

  v_now_local := (NEW.clock_in AT TIME ZONE v_tz);
  v_sched_local := (date_trunc('day', v_now_local) + v_sched::time);
  v_diff_min := EXTRACT(EPOCH FROM (v_now_local - v_sched_local)) / 60;

  IF v_diff_min > COALESCE(v_threshold, 5) THEN
    NEW.late := true;
    NEW.late_minutes := v_diff_min;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_time_entries_compute_late ON public.time_entries;
CREATE TRIGGER trg_time_entries_compute_late
BEFORE INSERT ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.tg_time_entries_compute_late();

-- Manager override audit view helper (optional): use existing audit_log table.
