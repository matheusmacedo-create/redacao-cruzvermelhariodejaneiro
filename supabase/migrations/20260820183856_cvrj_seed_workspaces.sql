-- app/api/bootstrap/route.ts lê os workspaces já existentes para vincular
-- o primeiro administrador; sem estas duas linhas o admin nasce sem espaço.
insert into public.workspaces (name, slug, kind) values
  ('Demonstração', 'demonstracao', 'demo'),
  ('Produção',     'producao',     'production')
on conflict (slug) do nothing;
