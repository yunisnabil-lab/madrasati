-- Lets the admin and the supervisor delete contact requests that have already
-- been reviewed (approved or rejected). Pending requests can never be deleted,
-- and nobody else (teacher / edari) can delete anything.
-- Safe to run more than once; changes no existing data.

drop policy if exists "reviewers can delete handled contact requests" on public.contact_requests;
create policy "reviewers can delete handled contact requests"
  on public.contact_requests for delete
  using (
    school_id = my_school_id()
    and get_my_staff_role() in ('admin', 'supervisor')
    and status <> 'pending'
  );
