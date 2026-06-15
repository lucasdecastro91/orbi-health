-- =================================================================
-- SEED: orbi-demo
-- Org owner: c8d9b2e4-d3cd-487d-9779-97e6dc8b9922 (teste@orbihealth.com.br)
-- Execute no SQL Editor do Supabase como postgres/superadmin
-- =================================================================

-- ══════════════════════════════════════════════════════════════════
-- 0. LIMPEZA — remove dados anteriores deste seed (idempotente)
-- ══════════════════════════════════════════════════════════════════

DELETE FROM public.diet_meal_foods  WHERE meal_id IN (SELECT id FROM public.diet_meals WHERE diet_id IN ('d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002'));
DELETE FROM public.diet_meals       WHERE diet_id IN ('d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002');
DELETE FROM public.diets            WHERE id IN ('d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002');
DELETE FROM public.xp_events        WHERE org_id = '10000000-0000-0000-0000-000000000000';
DELETE FROM public.xp_totals        WHERE org_id = '10000000-0000-0000-0000-000000000000';
DELETE FROM public.historico_carga  WHERE aluno_id IN (SELECT id FROM public.alunos WHERE org_id = '10000000-0000-0000-0000-000000000000');
DELETE FROM public.exercicios       WHERE treino_id IN (SELECT t.id FROM public.treinos t JOIN public.semanas s ON s.id = t.semana_id JOIN public.planos_treino pt ON pt.id = s.plano_id JOIN public.alunos a ON a.id = pt.aluno_id WHERE a.org_id = '10000000-0000-0000-0000-000000000000');
DELETE FROM public.treinos          WHERE semana_id IN (SELECT s.id FROM public.semanas s JOIN public.planos_treino pt ON pt.id = s.plano_id JOIN public.alunos a ON a.id = pt.aluno_id WHERE a.org_id = '10000000-0000-0000-0000-000000000000');
DELETE FROM public.semanas          WHERE plano_id IN (SELECT pt.id FROM public.planos_treino pt JOIN public.alunos a ON a.id = pt.aluno_id WHERE a.org_id = '10000000-0000-0000-0000-000000000000');
DELETE FROM public.planos_treino    WHERE aluno_id IN (SELECT id FROM public.alunos WHERE org_id = '10000000-0000-0000-0000-000000000000');
DELETE FROM public.exercicios_base  WHERE org_id = '10000000-0000-0000-0000-000000000000';
DELETE FROM public.alunos           WHERE org_id = '10000000-0000-0000-0000-000000000000';
DELETE FROM public.organization_members WHERE org_id = '10000000-0000-0000-0000-000000000000' AND user_id != 'c8d9b2e4-d3cd-487d-9779-97e6dc8b9922';
DELETE FROM public.profiles WHERE id IN (
  '20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000004',
  '20000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000006',
  '20000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-000000000008'
);
DELETE FROM auth.users WHERE id IN (
  '20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000004',
  '20000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000006',
  '20000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-000000000008'
);
DELETE FROM public.alimentos        WHERE id BETWEEN 'a0000000-0000-0000-0000-000000000001' AND 'a0000000-0000-0000-0000-000000000022';

-- ── UUID Reference ────────────────────────────────────────────────
-- ORG      : 10000000-0000-0000-0000-000000000000
-- Students : 20000000-0000-0000-0000-0000000000{01..08}
-- Alunos   : 30000000-0000-0000-0000-0000000000{01..08}
-- Planos   : 40000000-0000-0000-0000-0000000000{01..08}
-- Semanas  : 50000000-0000-0000-0000-0000000000{01..08}
-- Treinos  : 60000000-0000-0000-0000-{student}{treino 01..03}
-- Exercs   : 70000000-0000-0000-0000-{student}{exer 01..04}
-- Aliments : a0000000-0000-0000-0000-0000000000{01..22}
-- SubGroups: b0000000-0000-0000-0000-0000000000{01..04}
-- SubFoods : c0000000-0000-0000-0000-0000000000{01..16}
-- Diets    : d0000000-0000-0000-0000-0000000000{01..02}
-- Meals    : e0000000-0000-0000-0000-0000000000{01..08}
-- MealFds  : f0000000-0000-0000-0000-0000000000{01..32}
-- =================================================================

-- ══════════════════════════════════════════════════════════════════
-- 1. ORGANIZAÇÃO
-- ══════════════════════════════════════════════════════════════════

INSERT INTO public.organizations (id, name, slug, owner_id, primary_color, theme, plan, active)
VALUES (
  '10000000-0000-0000-0000-000000000000',
  'Orbi Demo',
  'orbi-demo',
  'c8d9b2e4-d3cd-487d-9779-97e6dc8b9922',
  '#e8941a',
  'dark',
  'pro',
  true
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.organization_members (org_id, user_id, role)
VALUES (
  '10000000-0000-0000-0000-000000000000',
  'c8d9b2e4-d3cd-487d-9779-97e6dc8b9922',
  'owner'
) ON CONFLICT (org_id, user_id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════
-- 2. ALUNOS — auth.users + profiles + alunos + org_members
-- ══════════════════════════════════════════════════════════════════

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  ('20000000-0000-0000-0000-000000000001','authenticated','authenticated','ana.santos@demo.orbipro.com.br','',now(),now()-interval'90 days',now(),'{"provider":"email","providers":["email"]}','{"nome":"Ana Beatriz Santos","tipo_usuario":"aluno"}','','','',''),
  ('20000000-0000-0000-0000-000000000002','authenticated','authenticated','carlos.oliveira@demo.orbipro.com.br','',now(),now()-interval'80 days',now(),'{"provider":"email","providers":["email"]}','{"nome":"Carlos Eduardo Oliveira","tipo_usuario":"aluno"}','','','',''),
  ('20000000-0000-0000-0000-000000000003','authenticated','authenticated','fernanda.lima@demo.orbipro.com.br','',now(),now()-interval'70 days',now(),'{"provider":"email","providers":["email"]}','{"nome":"Fernanda Lima","tipo_usuario":"aluno"}','','','',''),
  ('20000000-0000-0000-0000-000000000004','authenticated','authenticated','rafael.mendes@demo.orbipro.com.br','',now(),now()-interval'60 days',now(),'{"provider":"email","providers":["email"]}','{"nome":"Rafael Mendes","tipo_usuario":"aluno"}','','','',''),
  ('20000000-0000-0000-0000-000000000005','authenticated','authenticated','juliana.ferreira@demo.orbipro.com.br','',now(),now()-interval'50 days',now(),'{"provider":"email","providers":["email"]}','{"nome":"Juliana Ferreira","tipo_usuario":"aluno"}','','','',''),
  ('20000000-0000-0000-0000-000000000006','authenticated','authenticated','bruno.alves@demo.orbipro.com.br','',now(),now()-interval'40 days',now(),'{"provider":"email","providers":["email"]}','{"nome":"Bruno Alves","tipo_usuario":"aluno"}','','','',''),
  ('20000000-0000-0000-0000-000000000007','authenticated','authenticated','camila.rodrigues@demo.orbipro.com.br','',now(),now()-interval'30 days',now(),'{"provider":"email","providers":["email"]}','{"nome":"Camila Rodrigues","tipo_usuario":"aluno"}','','','',''),
  ('20000000-0000-0000-0000-000000000008','authenticated','authenticated','diego.costa@demo.orbipro.com.br','',now(),now()-interval'20 days',now(),'{"provider":"email","providers":["email"]}','{"nome":"Diego Costa","tipo_usuario":"aluno"}','','','','')
;

-- profiles criados automaticamente pelo trigger handle_new_user (dispara no INSERT de auth.users)

INSERT INTO public.alunos (id, user_id, treinador_id, org_id, ativo, observacoes) VALUES
  ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','c8d9b2e4-d3cd-487d-9779-97e6dc8b9922','10000000-0000-0000-0000-000000000000',true,'Objetivo: hipertrofia. Sem restrições alimentares.'),
  ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','c8d9b2e4-d3cd-487d-9779-97e6dc8b9922','10000000-0000-0000-0000-000000000000',true,'Objetivo: definição. Intolerante a lactose.'),
  ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','c8d9b2e4-d3cd-487d-9779-97e6dc8b9922','10000000-0000-0000-0000-000000000000',true,'Objetivo: emagrecimento. Pratica corrida 3x/semana.'),
  ('30000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004','c8d9b2e4-d3cd-487d-9779-97e6dc8b9922','10000000-0000-0000-0000-000000000000',true,'Objetivo: força. Ex-atleta de futebol.'),
  ('30000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000005','c8d9b2e4-d3cd-487d-9779-97e6dc8b9922','10000000-0000-0000-0000-000000000000',true,'Objetivo: condicionamento. Iniciante.'),
  ('30000000-0000-0000-0000-000000000006','20000000-0000-0000-0000-000000000006','c8d9b2e4-d3cd-487d-9779-97e6dc8b9922','10000000-0000-0000-0000-000000000000',true,'Objetivo: hipertrofia. Treina há 2 anos.'),
  ('30000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-000000000007','c8d9b2e4-d3cd-487d-9779-97e6dc8b9922','10000000-0000-0000-0000-000000000000',true,'Objetivo: definição. Vegetariana.'),
  ('30000000-0000-0000-0000-000000000008','20000000-0000-0000-0000-000000000008','c8d9b2e4-d3cd-487d-9779-97e6dc8b9922','10000000-0000-0000-0000-000000000000',true,'Objetivo: hipertrofia. Iniciou há 3 semanas.')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.organization_members (org_id, user_id, role) VALUES
  ('10000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000001','student'),
  ('10000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000002','student'),
  ('10000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000003','student'),
  ('10000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000004','student'),
  ('10000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000005','student'),
  ('10000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000006','student'),
  ('10000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000007','student'),
  ('10000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000008','student')
ON CONFLICT (org_id, user_id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════
-- 3. BIBLIOTECA DE EXERCÍCIOS (exercicios_base)
-- ══════════════════════════════════════════════════════════════════

INSERT INTO public.exercicios_base (id, treinador_id, org_id, nome, descricao, grupo_muscular_principal, grupo_muscular_secundario, video_url)
SELECT * FROM (VALUES
  ('eb000001-0000-0000-0000-000000000001'::uuid,'c8d9b2e4-d3cd-487d-9779-97e6dc8b9922'::uuid,'10000000-0000-0000-0000-000000000000'::uuid,'Supino Reto com Barra','Deite no banco, desça a barra até o peito e empurre.','Peito','Tríceps','https://youtube.com/watch?v=supino-reto'),
  ('eb000001-0000-0000-0000-000000000002'::uuid,'c8d9b2e4-d3cd-487d-9779-97e6dc8b9922'::uuid,'10000000-0000-0000-0000-000000000000'::uuid,'Supino Inclinado com Halteres','45° de inclinação, trabalha porção superior do peitoral.','Peito','Ombros','https://youtube.com/watch?v=supino-inclinado'),
  ('eb000001-0000-0000-0000-000000000003'::uuid,'c8d9b2e4-d3cd-487d-9779-97e6dc8b9922'::uuid,'10000000-0000-0000-0000-000000000000'::uuid,'Crossover','Cabo alto, enfatiza a adução peitoral.','Peito',NULL,NULL),
  ('eb000001-0000-0000-0000-000000000004'::uuid,'c8d9b2e4-d3cd-487d-9779-97e6dc8b9922'::uuid,'10000000-0000-0000-0000-000000000000'::uuid,'Tríceps Testa com Barra W','Deitado no banco, desça a barra à testa.','Tríceps',NULL,NULL),
  ('eb000001-0000-0000-0000-000000000005'::uuid,'c8d9b2e4-d3cd-487d-9779-97e6dc8b9922'::uuid,'10000000-0000-0000-0000-000000000000'::uuid,'Puxada Frontal','Cabo largo, puxe até a clavícula.','Costas','Bíceps','https://youtube.com/watch?v=puxada-frontal'),
  ('eb000001-0000-0000-0000-000000000006'::uuid,'c8d9b2e4-d3cd-487d-9779-97e6dc8b9922'::uuid,'10000000-0000-0000-0000-000000000000'::uuid,'Remada Curvada com Barra','Tronco a 45°, puxe a barra em direção ao umbigo.','Costas','Bíceps',NULL),
  ('eb000001-0000-0000-0000-000000000007'::uuid,'c8d9b2e4-d3cd-487d-9779-97e6dc8b9922'::uuid,'10000000-0000-0000-0000-000000000000'::uuid,'Rosca Direta com Barra','Mantenha os cotovelos fixos ao longo do corpo.','Bíceps',NULL,NULL),
  ('eb000001-0000-0000-0000-000000000008'::uuid,'c8d9b2e4-d3cd-487d-9779-97e6dc8b9922'::uuid,'10000000-0000-0000-0000-000000000000'::uuid,'Agachamento Livre','Barra nas costas, desça até as coxas paralelas ao chão.','Quadríceps','Glúteos','https://youtube.com/watch?v=agachamento'),
  ('eb000001-0000-0000-0000-000000000009'::uuid,'c8d9b2e4-d3cd-487d-9779-97e6dc8b9922'::uuid,'10000000-0000-0000-0000-000000000000'::uuid,'Leg Press 45°','Pés na plataforma, desça até 90° de flexão.','Quadríceps','Glúteos',NULL),
  ('eb000001-0000-0000-0000-000000000010'::uuid,'c8d9b2e4-d3cd-487d-9779-97e6dc8b9922'::uuid,'10000000-0000-0000-0000-000000000000'::uuid,'Mesa Flexora','Deitado, flexione os joelhos puxando o calcanhar.','Posteriores',NULL,NULL),
  ('eb000001-0000-0000-0000-000000000011'::uuid,'c8d9b2e4-d3cd-487d-9779-97e6dc8b9922'::uuid,'10000000-0000-0000-0000-000000000000'::uuid,'Desenvolvimento com Barra','Barra à altura do queixo, empurre acima da cabeça.','Ombros','Tríceps',NULL),
  ('eb000001-0000-0000-0000-000000000012'::uuid,'c8d9b2e4-d3cd-487d-9779-97e6dc8b9922'::uuid,'10000000-0000-0000-0000-000000000000'::uuid,'Elevação Lateral com Halteres','Braços semiflexionados, eleve até 90°.','Ombros',NULL,NULL)
) AS v(id,treinador_id,org_id,nome,descricao,grupo_muscular_principal,grupo_muscular_secundario,video_url)
WHERE NOT EXISTS (SELECT 1 FROM public.exercicios_base WHERE id = v.id);

-- ══════════════════════════════════════════════════════════════════
-- 4. PLANOS DE TREINO
-- ══════════════════════════════════════════════════════════════════

INSERT INTO public.planos_treino (id, aluno_id, nome_plano, data_inicio, observacoes, ativo)
SELECT * FROM (VALUES
  ('40000000-0000-0000-0000-000000000001'::uuid,'30000000-0000-0000-0000-000000000001'::uuid,'ABC — Hipertrofia Intermediária','2026-03-01'::date,'4x por semana, progressão de carga semanal.',true),
  ('40000000-0000-0000-0000-000000000002'::uuid,'30000000-0000-0000-0000-000000000002'::uuid,'ABC — Definição com Volume','2026-03-08'::date,'3–4x por semana, foco em densidade.',true),
  ('40000000-0000-0000-0000-000000000003'::uuid,'30000000-0000-0000-0000-000000000003'::uuid,'Full Body — Emagrecimento','2026-03-15'::date,'3x por semana, circuito metabólico.',true),
  ('40000000-0000-0000-0000-000000000004'::uuid,'30000000-0000-0000-0000-000000000004'::uuid,'AB — Força Máxima','2026-03-22'::date,'3x por semana, faixa 3–5 repetições.',true),
  ('40000000-0000-0000-0000-000000000005'::uuid,'30000000-0000-0000-0000-000000000005'::uuid,'Full Body — Iniciante','2026-04-01'::date,'3x por semana. Foco em técnica.',true),
  ('40000000-0000-0000-0000-000000000006'::uuid,'30000000-0000-0000-0000-000000000006'::uuid,'ABC — Hipertrofia Avançada','2026-03-01'::date,'5x por semana, volume alto.',true),
  ('40000000-0000-0000-0000-000000000007'::uuid,'30000000-0000-0000-0000-000000000007'::uuid,'ABC — Definição Feminina','2026-04-05'::date,'4x por semana.',true),
  ('40000000-0000-0000-0000-000000000008'::uuid,'30000000-0000-0000-0000-000000000008'::uuid,'Full Body — Iniciante','2026-05-12'::date,'3x por semana. Adaptação.',true)
) AS v(id,aluno_id,nome_plano,data_inicio,observacoes,ativo)
WHERE NOT EXISTS (SELECT 1 FROM public.planos_treino WHERE id = v.id);

-- ── Semanas ────────────────────────────────────────────────────────
-- org_id is auto-filled by trigger trg_semana_org_id

INSERT INTO public.semanas (id, plano_id, numero_semana) VALUES
  ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1),
  ('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002',1),
  ('50000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000003',1),
  ('50000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000004',1),
  ('50000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000005',1),
  ('50000000-0000-0000-0000-000000000006','40000000-0000-0000-0000-000000000006',1),
  ('50000000-0000-0000-0000-000000000007','40000000-0000-0000-0000-000000000007',1),
  ('50000000-0000-0000-0000-000000000008','40000000-0000-0000-0000-000000000008',1)
ON CONFLICT (plano_id, numero_semana) DO NOTHING;

-- ── Treinos ────────────────────────────────────────────────────────
-- 3 treinos por semana (A=Peito+Tríceps, B=Costas+Bíceps, C=Pernas+Ombros)
-- Mostrados aqui para Ana (aluno 1) e Carlos (aluno 2) em detalhe
-- Demais alunos recebem treino simplificado

INSERT INTO public.treinos (id, semana_id, dia_semana, titulo_treino, descricao_geral)
SELECT * FROM (VALUES
  ('60000000-0000-0000-0001-000000000001'::uuid,'50000000-0000-0000-0000-000000000001'::uuid,'Segunda','A — Peito + Tríceps','Foco em força base no supino. Séries 4×8–12.'),
  ('60000000-0000-0000-0001-000000000002'::uuid,'50000000-0000-0000-0000-000000000001'::uuid,'Quarta','B — Costas + Bíceps','Puxadas e remadas. Séries 4×8–12.'),
  ('60000000-0000-0000-0001-000000000003'::uuid,'50000000-0000-0000-0000-000000000001'::uuid,'Sexta','C — Pernas + Ombros','Agachamento e desenvolvimento. Séries 4×8–12.'),
  ('60000000-0000-0000-0002-000000000001'::uuid,'50000000-0000-0000-0000-000000000002'::uuid,'Segunda','A — Peito + Tríceps','Supino e variações. Séries 3×12–15.'),
  ('60000000-0000-0000-0002-000000000002'::uuid,'50000000-0000-0000-0000-000000000002'::uuid,'Quarta','B — Costas + Bíceps','Puxada e rosca. Séries 3×12–15.'),
  ('60000000-0000-0000-0002-000000000003'::uuid,'50000000-0000-0000-0000-000000000002'::uuid,'Sexta','C — Pernas + Ombros','Leg press e ombros. Séries 3×12–15.'),
  ('60000000-0000-0000-0003-000000000001'::uuid,'50000000-0000-0000-0000-000000000003'::uuid,'Segunda','Full A','Circuito — peito, costas, pernas.'),
  ('60000000-0000-0000-0003-000000000002'::uuid,'50000000-0000-0000-0000-000000000003'::uuid,'Quarta','Full B','Circuito — ombros, bíceps, tríceps.'),
  ('60000000-0000-0000-0003-000000000003'::uuid,'50000000-0000-0000-0000-000000000003'::uuid,'Sexta','Full C','Circuito — glúteos, pernas, core.'),
  ('60000000-0000-0000-0004-000000000001'::uuid,'50000000-0000-0000-0000-000000000004'::uuid,'Segunda','A — Força Lower','Agachamento e terra.'),
  ('60000000-0000-0000-0004-000000000002'::uuid,'50000000-0000-0000-0000-000000000004'::uuid,'Quarta','B — Força Upper','Supino e remada pesada.'),
  ('60000000-0000-0000-0004-000000000003'::uuid,'50000000-0000-0000-0000-000000000004'::uuid,'Sexta','A — Força Lower','Repeat com ajuste de carga.'),
  ('60000000-0000-0000-0005-000000000001'::uuid,'50000000-0000-0000-0000-000000000005'::uuid,'Segunda','Full Body 1','Padrões básicos de movimento.'),
  ('60000000-0000-0000-0005-000000000002'::uuid,'50000000-0000-0000-0000-000000000005'::uuid,'Quarta','Full Body 2','Progressão dos pesos.'),
  ('60000000-0000-0000-0005-000000000003'::uuid,'50000000-0000-0000-0000-000000000005'::uuid,'Sexta','Full Body 3','Consolidação da semana.'),
  ('60000000-0000-0000-0006-000000000001'::uuid,'50000000-0000-0000-0000-000000000006'::uuid,'Segunda','A — Peito + Tríceps','Volume alto, 5×10.'),
  ('60000000-0000-0000-0006-000000000002'::uuid,'50000000-0000-0000-0000-000000000006'::uuid,'Terça','B — Costas + Bíceps','Volume alto, 5×10.'),
  ('60000000-0000-0000-0006-000000000003'::uuid,'50000000-0000-0000-0000-000000000006'::uuid,'Quinta','C — Pernas + Ombros','5×10.'),
  ('60000000-0000-0000-0007-000000000001'::uuid,'50000000-0000-0000-0000-000000000007'::uuid,'Segunda','A — Peito + Tríceps','3×12.'),
  ('60000000-0000-0000-0007-000000000002'::uuid,'50000000-0000-0000-0000-000000000007'::uuid,'Quarta','B — Costas + Bíceps','3×12.'),
  ('60000000-0000-0000-0007-000000000003'::uuid,'50000000-0000-0000-0000-000000000007'::uuid,'Sexta','C — Glúteos + Pernas','3×12.'),
  ('60000000-0000-0000-0008-000000000001'::uuid,'50000000-0000-0000-0000-000000000008'::uuid,'Segunda','Full Body 1','Introdução.'),
  ('60000000-0000-0000-0008-000000000002'::uuid,'50000000-0000-0000-0000-000000000008'::uuid,'Quarta','Full Body 2','Prática dos movimentos.'),
  ('60000000-0000-0000-0008-000000000003'::uuid,'50000000-0000-0000-0000-000000000008'::uuid,'Sexta','Full Body 3','Finalização da semana.')
) AS v(id,semana_id,dia_semana,titulo_treino,descricao_geral)
WHERE NOT EXISTS (SELECT 1 FROM public.treinos WHERE id = v.id);

-- ── Exercícios ────────────────────────────────────────────────────
INSERT INTO public.exercicios (id, treino_id, exercicio_base_id, nome_exercicio, series, repeticoes, descanso, carga_base, ordem)
SELECT * FROM (VALUES
  ('70000000-0000-0001-0001-000000000001'::uuid,'60000000-0000-0000-0001-000000000001'::uuid,'eb000001-0000-0000-0000-000000000001'::uuid,'Supino Reto com Barra','4','8–10','90s','60kg',1),
  ('70000000-0000-0001-0001-000000000002'::uuid,'60000000-0000-0000-0001-000000000001'::uuid,'eb000001-0000-0000-0000-000000000002'::uuid,'Supino Inclinado com Halteres','4','10–12','75s','20kg',2),
  ('70000000-0000-0001-0001-000000000003'::uuid,'60000000-0000-0000-0001-000000000001'::uuid,'eb000001-0000-0000-0000-000000000003'::uuid,'Crossover','3','12–15','60s','15kg',3),
  ('70000000-0000-0001-0001-000000000004'::uuid,'60000000-0000-0000-0001-000000000001'::uuid,'eb000001-0000-0000-0000-000000000004'::uuid,'Tríceps Testa com Barra W','3','10–12','60s','20kg',4),
  ('70000000-0000-0001-0002-000000000001'::uuid,'60000000-0000-0000-0001-000000000002'::uuid,'eb000001-0000-0000-0000-000000000005'::uuid,'Puxada Frontal','4','8–10','90s','50kg',1),
  ('70000000-0000-0001-0002-000000000002'::uuid,'60000000-0000-0000-0001-000000000002'::uuid,'eb000001-0000-0000-0000-000000000006'::uuid,'Remada Curvada com Barra','4','8–10','90s','45kg',2),
  ('70000000-0000-0001-0002-000000000003'::uuid,'60000000-0000-0000-0001-000000000002'::uuid,'eb000001-0000-0000-0000-000000000007'::uuid,'Rosca Direta com Barra','3','10–12','60s','25kg',3),
  ('70000000-0000-0001-0003-000000000001'::uuid,'60000000-0000-0000-0001-000000000003'::uuid,'eb000001-0000-0000-0000-000000000008'::uuid,'Agachamento Livre','4','6–8','120s','70kg',1),
  ('70000000-0000-0001-0003-000000000002'::uuid,'60000000-0000-0000-0001-000000000003'::uuid,'eb000001-0000-0000-0000-000000000009'::uuid,'Leg Press 45°','4','10–12','90s','120kg',2),
  ('70000000-0000-0001-0003-000000000003'::uuid,'60000000-0000-0000-0001-000000000003'::uuid,'eb000001-0000-0000-0000-000000000010'::uuid,'Mesa Flexora','3','12–15','60s','30kg',3),
  ('70000000-0000-0001-0003-000000000004'::uuid,'60000000-0000-0000-0001-000000000003'::uuid,'eb000001-0000-0000-0000-000000000011'::uuid,'Desenvolvimento com Barra','4','8–10','90s','30kg',4),
  ('70000000-0000-0002-0001-000000000001'::uuid,'60000000-0000-0000-0002-000000000001'::uuid,'eb000001-0000-0000-0000-000000000001'::uuid,'Supino Reto com Barra','3','12–15','75s','50kg',1),
  ('70000000-0000-0002-0001-000000000002'::uuid,'60000000-0000-0000-0002-000000000001'::uuid,'eb000001-0000-0000-0000-000000000003'::uuid,'Crossover','3','15','60s','12kg',2),
  ('70000000-0000-0002-0001-000000000003'::uuid,'60000000-0000-0000-0002-000000000001'::uuid,'eb000001-0000-0000-0000-000000000004'::uuid,'Tríceps Testa com Barra W','3','12','60s','17.5kg',3),
  ('70000000-0000-0002-0002-000000000001'::uuid,'60000000-0000-0000-0002-000000000002'::uuid,'eb000001-0000-0000-0000-000000000005'::uuid,'Puxada Frontal','3','12–15','75s','45kg',1),
  ('70000000-0000-0002-0002-000000000002'::uuid,'60000000-0000-0000-0002-000000000002'::uuid,'eb000001-0000-0000-0000-000000000006'::uuid,'Remada Curvada com Barra','3','12','75s','40kg',2),
  ('70000000-0000-0002-0002-000000000003'::uuid,'60000000-0000-0000-0002-000000000002'::uuid,'eb000001-0000-0000-0000-000000000007'::uuid,'Rosca Direta com Barra','3','12','60s','20kg',3),
  ('70000000-0000-0002-0003-000000000001'::uuid,'60000000-0000-0000-0002-000000000003'::uuid,'eb000001-0000-0000-0000-000000000009'::uuid,'Leg Press 45°','3','15','75s','100kg',1),
  ('70000000-0000-0002-0003-000000000002'::uuid,'60000000-0000-0000-0002-000000000003'::uuid,'eb000001-0000-0000-0000-000000000010'::uuid,'Mesa Flexora','3','15','60s','25kg',2),
  ('70000000-0000-0002-0003-000000000003'::uuid,'60000000-0000-0000-0002-000000000003'::uuid,'eb000001-0000-0000-0000-000000000012'::uuid,'Elevação Lateral com Halteres','3','15','60s','7kg',3),
  ('70000000-0000-0003-0001-000000000001'::uuid,'60000000-0000-0000-0003-000000000001'::uuid,'eb000001-0000-0000-0000-000000000001'::uuid,'Supino Reto com Barra','3','12','60s','35kg',1),
  ('70000000-0000-0003-0001-000000000002'::uuid,'60000000-0000-0000-0003-000000000001'::uuid,'eb000001-0000-0000-0000-000000000008'::uuid,'Agachamento Livre','3','12','75s','40kg',2),
  ('70000000-0000-0003-0001-000000000003'::uuid,'60000000-0000-0000-0003-000000000001'::uuid,'eb000001-0000-0000-0000-000000000005'::uuid,'Puxada Frontal','3','12','60s','35kg',3),
  ('70000000-0000-0004-0001-000000000001'::uuid,'60000000-0000-0000-0004-000000000001'::uuid,'eb000001-0000-0000-0000-000000000008'::uuid,'Agachamento Livre','5','3–5','180s','100kg',1),
  ('70000000-0000-0004-0001-000000000002'::uuid,'60000000-0000-0000-0004-000000000001'::uuid,'eb000001-0000-0000-0000-000000000009'::uuid,'Leg Press 45°','4','5','120s','180kg',2),
  ('70000000-0000-0005-0001-000000000001'::uuid,'60000000-0000-0000-0005-000000000001'::uuid,'eb000001-0000-0000-0000-000000000008'::uuid,'Agachamento Livre','3','12','90s','30kg',1),
  ('70000000-0000-0005-0001-000000000002'::uuid,'60000000-0000-0000-0005-000000000001'::uuid,'eb000001-0000-0000-0000-000000000001'::uuid,'Supino Reto com Barra','3','12','75s','30kg',2),
  ('70000000-0000-0006-0001-000000000001'::uuid,'60000000-0000-0000-0006-000000000001'::uuid,'eb000001-0000-0000-0000-000000000001'::uuid,'Supino Reto com Barra','5','10','75s','70kg',1),
  ('70000000-0000-0006-0001-000000000002'::uuid,'60000000-0000-0000-0006-000000000001'::uuid,'eb000001-0000-0000-0000-000000000003'::uuid,'Crossover','5','10','60s','20kg',2),
  ('70000000-0000-0007-0001-000000000001'::uuid,'60000000-0000-0000-0007-000000000001'::uuid,'eb000001-0000-0000-0000-000000000001'::uuid,'Supino Reto com Barra','3','12','75s','30kg',1),
  ('70000000-0000-0007-0001-000000000002'::uuid,'60000000-0000-0000-0007-000000000001'::uuid,'eb000001-0000-0000-0000-000000000005'::uuid,'Puxada Frontal','3','12','60s','28kg',2),
  ('70000000-0000-0008-0001-000000000001'::uuid,'60000000-0000-0000-0008-000000000001'::uuid,'eb000001-0000-0000-0000-000000000008'::uuid,'Agachamento Livre','3','10','90s','20kg',1),
  ('70000000-0000-0008-0001-000000000002'::uuid,'60000000-0000-0000-0008-000000000001'::uuid,'eb000001-0000-0000-0000-000000000001'::uuid,'Supino Reto com Barra','3','10','75s','20kg',2)
) AS v(id,treino_id,exercicio_base_id,nome_exercicio,series,repeticoes,descanso,carga_base,ordem)
WHERE NOT EXISTS (SELECT 1 FROM public.exercicios WHERE id = v.id);

-- ══════════════════════════════════════════════════════════════════
-- 5. HISTÓRICO DE CARGA PROGRESSIVA (12 semanas)
-- exercicio_id references exercicios.id | aluno_id references alunos.id
-- ══════════════════════════════════════════════════════════════════

-- Ana — Supino Reto (semana 1→12: 52.5 → 75kg)
INSERT INTO public.historico_carga (exercicio_id, aluno_id, carga, data_registro) VALUES
  ('70000000-0000-0001-0001-000000000001','30000000-0000-0000-0000-000000000001','52.5kg', now()-interval'84 days'),
  ('70000000-0000-0001-0001-000000000001','30000000-0000-0000-0000-000000000001','55kg',   now()-interval'77 days'),
  ('70000000-0000-0001-0001-000000000001','30000000-0000-0000-0000-000000000001','57.5kg', now()-interval'70 days'),
  ('70000000-0000-0001-0001-000000000001','30000000-0000-0000-0000-000000000001','60kg',   now()-interval'63 days'),
  ('70000000-0000-0001-0001-000000000001','30000000-0000-0000-0000-000000000001','62.5kg', now()-interval'56 days'),
  ('70000000-0000-0001-0001-000000000001','30000000-0000-0000-0000-000000000001','65kg',   now()-interval'49 days'),
  ('70000000-0000-0001-0001-000000000001','30000000-0000-0000-0000-000000000001','65kg',   now()-interval'42 days'),
  ('70000000-0000-0001-0001-000000000001','30000000-0000-0000-0000-000000000001','67.5kg', now()-interval'35 days'),
  ('70000000-0000-0001-0001-000000000001','30000000-0000-0000-0000-000000000001','70kg',   now()-interval'28 days'),
  ('70000000-0000-0001-0001-000000000001','30000000-0000-0000-0000-000000000001','72.5kg', now()-interval'21 days'),
  ('70000000-0000-0001-0001-000000000001','30000000-0000-0000-0000-000000000001','72.5kg', now()-interval'14 days'),
  ('70000000-0000-0001-0001-000000000001','30000000-0000-0000-0000-000000000001','75kg',   now()-interval'7 days');

-- Ana — Agachamento Livre (55 → 90kg)
INSERT INTO public.historico_carga (exercicio_id, aluno_id, carga, data_registro) VALUES
  ('70000000-0000-0001-0003-000000000001','30000000-0000-0000-0000-000000000001','55kg',  now()-interval'84 days'),
  ('70000000-0000-0001-0003-000000000001','30000000-0000-0000-0000-000000000001','60kg',  now()-interval'77 days'),
  ('70000000-0000-0001-0003-000000000001','30000000-0000-0000-0000-000000000001','62.5kg',now()-interval'70 days'),
  ('70000000-0000-0001-0003-000000000001','30000000-0000-0000-0000-000000000001','65kg',  now()-interval'63 days'),
  ('70000000-0000-0001-0003-000000000001','30000000-0000-0000-0000-000000000001','67.5kg',now()-interval'56 days'),
  ('70000000-0000-0001-0003-000000000001','30000000-0000-0000-0000-000000000001','70kg',  now()-interval'49 days'),
  ('70000000-0000-0001-0003-000000000001','30000000-0000-0000-0000-000000000001','72.5kg',now()-interval'42 days'),
  ('70000000-0000-0001-0003-000000000001','30000000-0000-0000-0000-000000000001','75kg',  now()-interval'35 days'),
  ('70000000-0000-0001-0003-000000000001','30000000-0000-0000-0000-000000000001','77.5kg',now()-interval'28 days'),
  ('70000000-0000-0001-0003-000000000001','30000000-0000-0000-0000-000000000001','80kg',  now()-interval'21 days'),
  ('70000000-0000-0001-0003-000000000001','30000000-0000-0000-0000-000000000001','85kg',  now()-interval'14 days'),
  ('70000000-0000-0001-0003-000000000001','30000000-0000-0000-0000-000000000001','90kg',  now()-interval'7 days');

-- Ana — Puxada Frontal (38 → 62.5kg)
INSERT INTO public.historico_carga (exercicio_id, aluno_id, carga, data_registro) VALUES
  ('70000000-0000-0001-0002-000000000001','30000000-0000-0000-0000-000000000001','38kg',  now()-interval'84 days'),
  ('70000000-0000-0001-0002-000000000001','30000000-0000-0000-0000-000000000001','40kg',  now()-interval'70 days'),
  ('70000000-0000-0001-0002-000000000001','30000000-0000-0000-0000-000000000001','45kg',  now()-interval'56 days'),
  ('70000000-0000-0001-0002-000000000001','30000000-0000-0000-0000-000000000001','47.5kg',now()-interval'42 days'),
  ('70000000-0000-0001-0002-000000000001','30000000-0000-0000-0000-000000000001','50kg',  now()-interval'28 days'),
  ('70000000-0000-0001-0002-000000000001','30000000-0000-0000-0000-000000000001','55kg',  now()-interval'14 days'),
  ('70000000-0000-0001-0002-000000000001','30000000-0000-0000-0000-000000000001','62.5kg',now()-interval'7 days');

-- Carlos — Supino Reto (40 → 60kg)
INSERT INTO public.historico_carga (exercicio_id, aluno_id, carga, data_registro) VALUES
  ('70000000-0000-0002-0001-000000000001','30000000-0000-0000-0000-000000000002','40kg',  now()-interval'77 days'),
  ('70000000-0000-0002-0001-000000000001','30000000-0000-0000-0000-000000000002','42.5kg',now()-interval'70 days'),
  ('70000000-0000-0002-0001-000000000001','30000000-0000-0000-0000-000000000002','45kg',  now()-interval'63 days'),
  ('70000000-0000-0002-0001-000000000001','30000000-0000-0000-0000-000000000002','47.5kg',now()-interval'56 days'),
  ('70000000-0000-0002-0001-000000000001','30000000-0000-0000-0000-000000000002','50kg',  now()-interval'49 days'),
  ('70000000-0000-0002-0001-000000000001','30000000-0000-0000-0000-000000000002','50kg',  now()-interval'42 days'),
  ('70000000-0000-0002-0001-000000000001','30000000-0000-0000-0000-000000000002','52.5kg',now()-interval'35 days'),
  ('70000000-0000-0002-0001-000000000001','30000000-0000-0000-0000-000000000002','55kg',  now()-interval'28 days'),
  ('70000000-0000-0002-0001-000000000001','30000000-0000-0000-0000-000000000002','57.5kg',now()-interval'21 days'),
  ('70000000-0000-0002-0001-000000000001','30000000-0000-0000-0000-000000000002','57.5kg',now()-interval'14 days'),
  ('70000000-0000-0002-0001-000000000001','30000000-0000-0000-0000-000000000002','60kg',  now()-interval'7 days');

-- Carlos — Leg Press (80 → 130kg)
INSERT INTO public.historico_carga (exercicio_id, aluno_id, carga, data_registro) VALUES
  ('70000000-0000-0002-0003-000000000001','30000000-0000-0000-0000-000000000002','80kg',  now()-interval'70 days'),
  ('70000000-0000-0002-0003-000000000001','30000000-0000-0000-0000-000000000002','90kg',  now()-interval'56 days'),
  ('70000000-0000-0002-0003-000000000001','30000000-0000-0000-0000-000000000002','100kg', now()-interval'42 days'),
  ('70000000-0000-0002-0003-000000000001','30000000-0000-0000-0000-000000000002','110kg', now()-interval'28 days'),
  ('70000000-0000-0002-0003-000000000001','30000000-0000-0000-0000-000000000002','120kg', now()-interval'14 days'),
  ('70000000-0000-0002-0003-000000000001','30000000-0000-0000-0000-000000000002','130kg', now()-interval'7 days');

-- Rafael — Agachamento (força: 80 → 115kg)
INSERT INTO public.historico_carga (exercicio_id, aluno_id, carga, data_registro) VALUES
  ('70000000-0000-0004-0001-000000000001','30000000-0000-0000-0000-000000000004','80kg',  now()-interval'56 days'),
  ('70000000-0000-0004-0001-000000000001','30000000-0000-0000-0000-000000000004','87.5kg',now()-interval'42 days'),
  ('70000000-0000-0004-0001-000000000001','30000000-0000-0000-0000-000000000004','95kg',  now()-interval'28 days'),
  ('70000000-0000-0004-0001-000000000001','30000000-0000-0000-0000-000000000004','105kg', now()-interval'14 days'),
  ('70000000-0000-0004-0001-000000000001','30000000-0000-0000-0000-000000000004','115kg', now()-interval'7 days');

-- Bruno — Supino (50 → 80kg)
INSERT INTO public.historico_carga (exercicio_id, aluno_id, carga, data_registro) VALUES
  ('70000000-0000-0006-0001-000000000001','30000000-0000-0000-0000-000000000006','50kg',  now()-interval'35 days'),
  ('70000000-0000-0006-0001-000000000001','30000000-0000-0000-0000-000000000006','60kg',  now()-interval'21 days'),
  ('70000000-0000-0006-0001-000000000001','30000000-0000-0000-0000-000000000006','70kg',  now()-interval'14 days'),
  ('70000000-0000-0006-0001-000000000001','30000000-0000-0000-0000-000000000006','80kg',  now()-interval'7 days');

-- ══════════════════════════════════════════════════════════════════
-- 6. XP EVENTS (trigger auto-atualiza xp_totals)
-- Ranking: Ana 3500 > Carlos 2800 > Fernanda 2100 > Rafael 1800
--          Juliana 1400 > Bruno 1050 > Camila 700 > Diego 380
-- ══════════════════════════════════════════════════════════════════

INSERT INTO public.xp_events (student_id, org_id, source, xp, ref_date, note) VALUES
  -- Ana Beatriz (3500 XP)
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000000','workout_complete',1200,'2026-03-10','Treinos completados — março'),
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000000','diet_day',800,'2026-03-15','Dieta seguida — março'),
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000000','checkin',500,'2026-04-01','Check-ins — abril'),
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000000','streak_bonus',600,'2026-04-20','Bônus de consistência'),
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000000','manual',400,'2026-05-01','Bônus do treinador — PR no supino'),
  -- Carlos Eduardo (2800 XP)
  ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000000','workout_complete',1000,'2026-03-10','Treinos — março'),
  ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000000','diet_day',900,'2026-03-20','Dieta — março/abril'),
  ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000000','checkin',500,'2026-04-10','Check-ins'),
  ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000000','streak_bonus',400,'2026-05-01','Sequência 30 dias'),
  -- Fernanda Lima (2100 XP)
  ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000000','workout_complete',900,'2026-03-15','Treinos — março'),
  ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000000','diet_day',700,'2026-04-01','Dieta seguida'),
  ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000000','checkin',300,'2026-04-15','Check-ins'),
  ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000000','streak_bonus',200,'2026-05-01','Bônus consistência'),
  -- Rafael Mendes (1800 XP)
  ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000000','workout_complete',900,'2026-03-22','Treinos — força'),
  ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000000','diet_day',500,'2026-04-05','Protocolo alimentar'),
  ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000000','streak_bonus',400,'2026-05-10','Bônus consecutivo'),
  -- Juliana Ferreira (1400 XP)
  ('20000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000000','workout_complete',700,'2026-04-01','Treinos — iniciante'),
  ('20000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000000','diet_day',400,'2026-04-15','Dieta'),
  ('20000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000000','checkin',300,'2026-05-01','Check-ins'),
  -- Bruno Alves (1050 XP)
  ('20000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000000','workout_complete',600,'2026-04-20','Treinos — volume'),
  ('20000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000000','diet_day',300,'2026-05-01','Alimentação'),
  ('20000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000000','checkin',150,'2026-05-15','Check-ins'),
  -- Camila Rodrigues (700 XP)
  ('20000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000000','workout_complete',400,'2026-05-05','Treinos — definição'),
  ('20000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000000','diet_day',200,'2026-05-15','Dieta seguida'),
  ('20000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000000','checkin',100,'2026-05-25','Check-ins iniciais'),
  -- Diego Costa (380 XP)
  ('20000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000000','workout_complete',250,'2026-05-12','Primeiros treinos'),
  ('20000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000000','checkin',130,'2026-05-20','Primeiros check-ins')
ON CONFLICT (student_id, source, ref_date) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════
-- 7. ALIMENTOS GLOBAIS (org_id NULL, fonte = 'taco')
-- Valores nutricionais aproximados por 100g (TACO/IBGE)
-- ══════════════════════════════════════════════════════════════════

INSERT INTO public.alimentos (id, nome, porcao_descricao, porcao_gramas, kcal, proteina_g, carb_g, gordura_g, fibra_g, sodio_mg, fonte, org_id, status) VALUES
  ('a0000000-0000-0000-0000-000000000001','Frango grelhado (peito sem pele)','100g',100,163,31.0,0.0,3.5,0.0,74,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000002','Arroz branco cozido','100g',100,128,2.5,28.1,0.2,1.6,1,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000003','Feijão carioca cozido','100g',100,76,4.5,13.6,0.5,8.5,2,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000004','Batata doce cozida','100g',100,77,1.4,18.4,0.1,2.5,22,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000005','Ovo cozido inteiro','50g (1 unidade)',50,71,6.2,0.5,5.0,0.0,63,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000006','Aveia em flocos','40g',40,152,5.6,27.2,3.4,4.4,1,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000007','Brócolis cozido','100g',100,25,3.0,3.5,0.3,2.6,15,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000008','Banana prata','100g',100,98,1.3,26.0,0.1,2.0,1,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000009','Leite desnatado UHT','200ml',200,68,6.8,9.4,0.2,0.0,106,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000010','Iogurte grego desnatado','170g',170,99,17.0,6.0,0.0,0.0,65,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000011','Whey protein concentrado','30g (1 scoop)',30,117,21.0,6.0,1.5,0.0,60,'global',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000012','Azeite de oliva','10ml',10,88,0.0,0.0,10.0,0.0,0,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000013','Queijo minas frescal','50g',50,72,7.0,1.4,4.5,0.0,300,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000014','Maçã Fuji','150g',150,79,0.4,21.0,0.2,2.0,1,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000015','Tilápia grelhada','100g',100,96,20.0,0.0,1.7,0.0,52,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000016','Pão de forma integral','50g (2 fatias)',50,126,5.0,24.0,2.0,4.0,290,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000017','Cream cheese light','30g',30,60,3.0,2.0,5.0,0.0,135,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000018','Mamão papaia','200g',200,74,1.0,19.0,0.2,2.4,8,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000019','Granola tradicional','40g',40,168,4.0,30.0,5.0,3.2,20,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000020','Salmão grelhado','100g',100,183,20.0,0.0,11.0,0.0,45,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000021','Arroz integral cozido','100g',100,124,2.6,25.8,1.0,2.7,1,'taco',NULL,'aprovado'),
  ('a0000000-0000-0000-0000-000000000022','Proteína isolada de soja','30g (1 scoop)',30,105,22.0,3.0,0.5,0.0,280,'global',NULL,'aprovado')
ON CONFLICT (nome) WHERE org_id IS NULL DO NOTHING;

-- ══════════════════════════════════════════════════════════════════
-- 8. DIETAS — Ana Beatriz e Carlos Eduardo
-- ══════════════════════════════════════════════════════════════════

INSERT INTO public.diets (id, student_id, org_id, title, calories, is_active) VALUES
  ('d0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000000','Dieta Hipertrofia — Ana Beatriz',2600,true),
  ('d0000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000000','Dieta Definição — Carlos Eduardo',2100,true);

INSERT INTO public.diet_meals (diet_id, name, time_suggestion, order_index, notes) VALUES
  ('d0000000-0000-0000-0000-000000000001','Café da Manhã','07:00',0,'Principal refeição do dia. Não pular.'),
  ('d0000000-0000-0000-0000-000000000001','Lanche da Manhã','10:00',1,'Refeição pré-treino se treinar ao meio-dia.'),
  ('d0000000-0000-0000-0000-000000000001','Almoço','13:00',2,'Maior refeição. Comer devagar.'),
  ('d0000000-0000-0000-0000-000000000001','Jantar','19:30',3,'Refeição pós-treino ou noturna.'),
  ('d0000000-0000-0000-0000-000000000002','Café da Manhã','07:00',0,'Baixo em carboidrato.'),
  ('d0000000-0000-0000-0000-000000000002','Lanche da Manhã','10:30',1,'Collation proteica.'),
  ('d0000000-0000-0000-0000-000000000002','Almoço','12:30',2,'Proteína alta, carb moderado.'),
  ('d0000000-0000-0000-0000-000000000002','Jantar','19:30',3,'Leve. Priorizar proteína magra.');

-- ── Alimentos das refeições (sem substitution_group_id) ───────────

INSERT INTO public.diet_meal_foods (meal_id, name, portion, alimento_id, quantidade, unidade, order_index)
SELECT m.id, v.name, v.portion, v.alimento_id::uuid, v.quantidade, v.unidade, v.order_index
FROM public.diet_meals m
JOIN (VALUES
  -- ANA Café da Manhã
  ('d0000000-0000-0000-0000-000000000001','Café da Manhã','Ovo cozido','2 unidades','a0000000-0000-0000-0000-000000000005',100,'g',0),
  ('d0000000-0000-0000-0000-000000000001','Café da Manhã','Aveia em flocos','50g','a0000000-0000-0000-0000-000000000006',50,'g',1),
  ('d0000000-0000-0000-0000-000000000001','Café da Manhã','Banana prata','1 unidade média','a0000000-0000-0000-0000-000000000008',100,'g',2),
  ('d0000000-0000-0000-0000-000000000001','Café da Manhã','Leite desnatado','200ml','a0000000-0000-0000-0000-000000000009',200,'ml',3),
  -- ANA Lanche da Manhã
  ('d0000000-0000-0000-0000-000000000001','Lanche da Manhã','Iogurte grego desnatado','1 pote (170g)','a0000000-0000-0000-0000-000000000010',170,'g',0),
  ('d0000000-0000-0000-0000-000000000001','Lanche da Manhã','Maçã Fuji','1 unidade (150g)','a0000000-0000-0000-0000-000000000014',150,'g',1),
  -- ANA Almoço
  ('d0000000-0000-0000-0000-000000000001','Almoço','Frango grelhado','150g','a0000000-0000-0000-0000-000000000001',150,'g',0),
  ('d0000000-0000-0000-0000-000000000001','Almoço','Arroz branco cozido','150g','a0000000-0000-0000-0000-000000000002',150,'g',1),
  ('d0000000-0000-0000-0000-000000000001','Almoço','Feijão carioca cozido','80g','a0000000-0000-0000-0000-000000000003',80,'g',2),
  ('d0000000-0000-0000-0000-000000000001','Almoço','Brócolis cozido','100g','a0000000-0000-0000-0000-000000000007',100,'g',3),
  ('d0000000-0000-0000-0000-000000000001','Almoço','Azeite de oliva','1 fio (10ml)','a0000000-0000-0000-0000-000000000012',10,'ml',4),
  -- ANA Jantar
  ('d0000000-0000-0000-0000-000000000001','Jantar','Tilápia grelhada','150g','a0000000-0000-0000-0000-000000000015',150,'g',0),
  ('d0000000-0000-0000-0000-000000000001','Jantar','Batata doce cozida','200g','a0000000-0000-0000-0000-000000000004',200,'g',1),
  ('d0000000-0000-0000-0000-000000000001','Jantar','Brócolis cozido','100g','a0000000-0000-0000-0000-000000000007',100,'g',2),
  ('d0000000-0000-0000-0000-000000000001','Jantar','Azeite de oliva','1 fio (10ml)','a0000000-0000-0000-0000-000000000012',10,'ml',3),
  -- CARLOS Café da Manhã
  ('d0000000-0000-0000-0000-000000000002','Café da Manhã','Whey protein','1 scoop (30g)','a0000000-0000-0000-0000-000000000011',30,'g',0),
  ('d0000000-0000-0000-0000-000000000002','Café da Manhã','Pão de forma integral','2 fatias (50g)','a0000000-0000-0000-0000-000000000016',50,'g',1),
  ('d0000000-0000-0000-0000-000000000002','Café da Manhã','Cream cheese light','30g','a0000000-0000-0000-0000-000000000017',30,'g',2),
  ('d0000000-0000-0000-0000-000000000002','Café da Manhã','Maçã Fuji','1 unidade (150g)','a0000000-0000-0000-0000-000000000014',150,'g',3),
  -- CARLOS Lanche da Manhã
  ('d0000000-0000-0000-0000-000000000002','Lanche da Manhã','Iogurte grego desnatado','1 pote (170g)','a0000000-0000-0000-0000-000000000010',170,'g',0),
  ('d0000000-0000-0000-0000-000000000002','Lanche da Manhã','Granola','40g','a0000000-0000-0000-0000-000000000019',40,'g',1),
  -- CARLOS Almoço
  ('d0000000-0000-0000-0000-000000000002','Almoço','Salmão grelhado','120g','a0000000-0000-0000-0000-000000000020',120,'g',0),
  ('d0000000-0000-0000-0000-000000000002','Almoço','Arroz integral cozido','150g','a0000000-0000-0000-0000-000000000021',150,'g',1),
  ('d0000000-0000-0000-0000-000000000002','Almoço','Brócolis cozido','150g','a0000000-0000-0000-0000-000000000007',150,'g',2),
  ('d0000000-0000-0000-0000-000000000002','Almoço','Azeite de oliva','1 fio (10ml)','a0000000-0000-0000-0000-000000000012',10,'ml',3),
  -- CARLOS Jantar
  ('d0000000-0000-0000-0000-000000000002','Jantar','Frango grelhado','150g','a0000000-0000-0000-0000-000000000001',150,'g',0),
  ('d0000000-0000-0000-0000-000000000002','Jantar','Batata doce cozida','200g','a0000000-0000-0000-0000-000000000004',200,'g',1),
  ('d0000000-0000-0000-0000-000000000002','Jantar','Queijo minas frescal','50g','a0000000-0000-0000-0000-000000000013',50,'g',2),
  ('d0000000-0000-0000-0000-000000000002','Jantar','Azeite de oliva','1 fio (10ml)','a0000000-0000-0000-0000-000000000012',10,'ml',3)
) AS v(diet_id, meal_name, name, portion, alimento_id, quantidade, unidade, order_index)
  ON m.diet_id = v.diet_id::uuid AND m.name = v.meal_name;

-- =================================================================
-- VERIFICAÇÃO RÁPIDA (execute após o seed)
-- =================================================================
-- SELECT o.name, o.slug, count(a.id) as alunos
-- FROM public.organizations o
-- JOIN public.alunos a ON a.org_id = o.id
-- WHERE o.slug = 'orbi-demo'
-- GROUP BY o.name, o.slug;

-- SELECT p.nome, xt.total_xp
-- FROM public.xp_totals xt
-- JOIN public.profiles p ON p.id = xt.student_id
-- JOIN public.alunos al ON al.user_id = xt.student_id
-- WHERE al.org_id = '10000000-0000-0000-0000-000000000000'
-- ORDER BY xt.total_xp DESC;
