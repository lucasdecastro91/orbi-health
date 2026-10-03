-- Limpeza dos dados de DEMONSTRAÇÃO inseridos em 2026-10-02 e 2026-10-03 na conta de teste
-- "Lucas Melo" (aluno 883d66d3-1ba2-4a77-8662-8a78216b7c66, org Get Shape),
-- só pra tirar os prints da landing page / App Store. Rodar depois dos prints.
-- Apaga SÓ os ids abaixo (os registros reais da conta não são tocados).

BEGIN;

UPDATE public.alunos SET form_atualizacao_ultima_data = '2026-07-28'
WHERE id = '883d66d3-1ba2-4a77-8662-8a78216b7c66' AND form_atualizacao_ultima_data IN ('2026-09-25','2026-09-26');

DELETE FROM public.registros_agua WHERE id IN (
 '9d863cd0-1a1a-4eaa-80b1-309d4e7b42b4','689d8721-a29c-4353-a2a7-5bd5641c3c27','824cf0d9-c575-4f19-acbf-d23bc2e1e2aa',
 'fea09d9a-ec43-46ae-ac45-9edc19106b8e','a2c38208-0e89-4ce3-8944-250c8a69a154',
 '0bfcd336-8be1-4ec1-bc78-d6eaa419bb90');

DELETE FROM public.meal_completions WHERE id IN (
 '7c85008d-8d71-447b-bc5f-4bad1c48a686','e6e41e25-c478-42f8-8fa4-1da534e40ded','41097400-f8c7-4842-886e-7a690dfcdd48',
 '1ea49ff0-9bd7-4bbe-aea8-4c81ad2c8059','889c8064-81b0-4f1c-a34e-1b97847cdef3','f197df8a-74a3-4f4f-b787-78b4f4e598a1',
 'a6304f79-ee5c-4ccf-97b6-04e5c341d6e0','36e901cf-9a55-47f3-9be4-3f8870eb442d','6327a71d-d70f-4cc1-89e5-4c3bbd02bda4',
 '712db5ca-e4a2-4092-839f-ddb418c48282','d4cea755-9c5a-4bc4-88cf-6b5f2ffdfba1','41bd4324-3ebc-49a9-b37c-3ac4f05eba9b',
 '1fab1f78-d659-45db-809d-802ffb977aa5','6eee81ab-71c4-46fa-99c5-76551a5bf334','bf26f927-c880-46e5-bf1a-f4263d63d6b3',
 'f6b06633-b421-44be-bc14-f8061aec1b33','ed3ee989-0e2a-4f3a-9736-cad1a5d31616','938ace5e-6504-4864-891e-dc0d5e622ea5',
 '375fd377-2dfb-4a68-ae76-2bd3379ba03e','1822b484-d68d-44df-a372-93feae1b68c3','c6d0a234-83c7-412e-9602-cc5585b979af',
 '804647cb-c99a-4150-981e-5ab9e956459e');

DELETE FROM public.cardio_sessoes WHERE id IN (
 '1af0a937-96b0-4099-ae1f-318208837386','691eac2f-5084-451e-bd5e-7b393318407d','da6b0bba-7a9b-4a35-a786-54fe35741578',
 '6c53ca4f-0987-4eb0-a9f6-d4d4329003fc');

DELETE FROM public.treino_sessoes_log WHERE id IN (
 '15ce4b5d-b83c-4e21-801b-6e5132abc865','8a70dcf2-3586-4049-bd6b-cd8ed0f0007e');

-- Carga da "Remada articulada neutra unilateral" (escalada x0,56 em 2026-10-03
-- pra terminar em 140 no print): volta aos valores ORIGINAIS.
UPDATE public.historico_carga h SET carga = v.c FROM (VALUES
 ('cc61a636-d056-4368-b297-ce313d112040'::uuid,'150'),
 ('d20707cc-ba8b-462e-a27b-9a57cac73884'::uuid,'160'),
 ('ceaae5d4-8af5-4b15-a30f-fd83ecc95684'::uuid,'165'),
 ('c3995d40-2ed4-4d73-aaa0-f4bcbf649625'::uuid,'170'),
 ('27c203f5-00aa-47a0-8917-e615e6446841'::uuid,'175'),
 ('409b44d9-e736-46fc-967b-8b4df9ff8001'::uuid,'200'),
 ('bc1131a7-7e39-4704-b6fd-e54772f52fb6'::uuid,'210'),
 ('ec67720a-73eb-4190-b599-5c5abd5cd083'::uuid,'220'),
 ('291d09c6-2f8c-4aba-b5e3-e02dc869b2ae'::uuid,'230'),
 ('fe6db535-1fb5-499b-a831-feac5e74ea00'::uuid,'235'),
 ('09ed3410-13da-4899-be45-cd4da499a0bc'::uuid,'250')
) v(id, c) WHERE h.id = v.id;
UPDATE public.exercicios_carga SET carga = '250' WHERE id = '90975a3e-0054-4771-bf2d-7d47a12f1ff5';

COMMIT;
