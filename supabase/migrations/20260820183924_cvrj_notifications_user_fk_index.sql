-- O índice (workspace_id, user_id) não cobre a FK notifications_user_id_fkey,
-- que precisa de user_id como coluna inicial para o cascade ao apagar um perfil.
create index notifications_user_id_fk_idx on public.notifications (user_id);
