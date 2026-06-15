-- ============================================================
-- Lista de Substituição por Organização
-- Grupos numerados com itens e porções equivalentes
-- ============================================================

-- 1. Tabela de grupos
CREATE TABLE IF NOT EXISTS public.lista_subst_grupos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  numero     INTEGER NOT NULL,
  nome       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, numero)
);

-- 2. Tabela de itens por grupo
CREATE TABLE IF NOT EXISTS public.lista_subst_itens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id   UUID NOT NULL REFERENCES public.lista_subst_grupos(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  porcao     TEXT,          -- ex: "70g", "240ml"; NULL para vegetais livres
  ordem      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Colunas em diet_meal_foods para referência à lista
ALTER TABLE public.diet_meal_foods
  ADD COLUMN IF NOT EXISTS lista_subst_grupo_id UUID REFERENCES public.lista_subst_grupos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lista_subst_porcoes  NUMERIC DEFAULT 1;

-- 4. RLS
ALTER TABLE public.lista_subst_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lista_subst_itens  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lsg_select" ON public.lista_subst_grupos FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));
CREATE POLICY "lsg_insert" ON public.lista_subst_grupos FOR INSERT TO authenticated
  WITH CHECK (public.is_org_owner(org_id));
CREATE POLICY "lsg_update" ON public.lista_subst_grupos FOR UPDATE TO authenticated
  USING (public.is_org_owner(org_id)) WITH CHECK (public.is_org_owner(org_id));
CREATE POLICY "lsg_delete" ON public.lista_subst_grupos FOR DELETE TO authenticated
  USING (public.is_org_owner(org_id));

CREATE POLICY "lsi_select" ON public.lista_subst_itens FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lista_subst_grupos g
    WHERE g.id = grupo_id AND public.is_org_member(g.org_id)
  ));
CREATE POLICY "lsi_insert" ON public.lista_subst_itens FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.lista_subst_grupos g
    WHERE g.id = grupo_id AND public.is_org_owner(g.org_id)
  ));
CREATE POLICY "lsi_update" ON public.lista_subst_itens FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lista_subst_grupos g
    WHERE g.id = grupo_id AND public.is_org_owner(g.org_id)
  ));
CREATE POLICY "lsi_delete" ON public.lista_subst_itens FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lista_subst_grupos g
    WHERE g.id = grupo_id AND public.is_org_owner(g.org_id)
  ));

-- 5. Pré-carrega lista Get Shape Training
DO $$
DECLARE
  v_org UUID;
  v_g   UUID;
BEGIN
  SELECT id INTO v_org FROM public.organizations WHERE slug = 'getshape' LIMIT 1;
  IF v_org IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.lista_subst_grupos WHERE org_id = v_org) THEN RETURN; END IF;

  -- Grupo 1
  INSERT INTO public.lista_subst_grupos (org_id, numero, nome) VALUES (v_org, 1, 'Carnes e Proteínas') RETURNING id INTO v_g;
  INSERT INTO public.lista_subst_itens (grupo_id, nome, porcao, ordem) VALUES
    (v_g, 'Atum sólido em água', '70g', 1),
    (v_g, 'Bacalhau cru', '60g', 2),
    (v_g, 'Camarão rio grande cozido', '90g', 3),
    (v_g, 'Caranguejo cozido', '95g', 4),
    (v_g, 'Contrafilé sem gordura grelhado', '40g', 5),
    (v_g, 'Coxa de frango sem pele cozida', '50g', 6),
    (v_g, 'Clara de ovo cozida (5 unidades)', '150g', 7),
    (v_g, 'Coxão mole sem gordura cozido', '40g', 8),
    (v_g, 'Filé de Merluza assado', '65g', 9),
    (v_g, 'Filé de frango grelhado', '50g', 10),
    (v_g, 'Filé de tilápia grelhada', '65g', 11),
    (v_g, 'Filé de pescada frito', '55g', 12),
    (v_g, 'Lombo de porco assado', '40g', 13),
    (v_g, 'Filé mignon sem gordura grelhado', '40g', 14),
    (v_g, 'Patinho sem gordura grelhado', '40g', 15),
    (v_g, 'Maminha grelhada', '50g', 16),
    (v_g, 'Pescada branca frita', NULL, 17),
    (v_g, 'Peito de peru defumado', '80g', 18),
    (v_g, 'Presunto sem capa de gordura', '90g', 19),
    (v_g, 'Sardinha assada', '50g', 20);

  -- Grupo 2
  INSERT INTO public.lista_subst_grupos (org_id, numero, nome) VALUES (v_org, 2, 'Cereais e Tubérculos') RETURNING id INTO v_g;
  INSERT INTO public.lista_subst_itens (grupo_id, nome, porcao, ordem) VALUES
    (v_g, 'Arroz branco cozido', '25g', 1),
    (v_g, 'Arroz integral cozido', '25g', 2),
    (v_g, 'Batata baroa/Mandioquinha cozida', '40g', 3),
    (v_g, 'Batata doce cozida', '40g', 4),
    (v_g, 'Batata inglesa cozida', '60g', 5),
    (v_g, 'Batata inglesa crua', '50g', 6),
    (v_g, 'Cará cozido', '40g', 7),
    (v_g, 'Inhame cru', '30g', 8),
    (v_g, 'Farinha de arroz', '10g', 9),
    (v_g, 'Macarrão cozido', '22g', 10),
    (v_g, 'Macarrão de arroz cru', '10g', 11),
    (v_g, 'Macarrão integral cozido', '25g', 12),
    (v_g, 'Mandioca/macaxeira cozida', '25g', 13),
    (v_g, 'Milho verde enlatado conserva', '75g', 14),
    (v_g, 'Quinoa cozida', '30g', 15);

  -- Grupo 3
  INSERT INTO public.lista_subst_grupos (org_id, numero, nome) VALUES (v_org, 3, 'Feijão e Leguminosas') RETURNING id INTO v_g;
  INSERT INTO public.lista_subst_itens (grupo_id, nome, porcao, ordem) VALUES
    (v_g, 'Ervilha em vagem', '42g', 1),
    (v_g, 'Ervilha em conserva', '42g', 2),
    (v_g, 'Feijão Fradinho/verde Cozido', '50g', 3),
    (v_g, 'Feijão Jalo cozido', '40g', 4),
    (v_g, 'Feijão carioca cozido', '50g', 5),
    (v_g, 'Feijão preto cozido', '50g', 6),
    (v_g, 'Lentilha cozida', '40g', 7),
    (v_g, 'Grão de bico cru', '10g', 8);

  -- Grupo 4
  INSERT INTO public.lista_subst_grupos (org_id, numero, nome) VALUES (v_org, 4, 'Óleos e Gorduras') RETURNING id INTO v_g;
  INSERT INTO public.lista_subst_itens (grupo_id, nome, porcao, ordem) VALUES
    (v_g, 'Azeite de oliva', '8ml', 1),
    (v_g, 'Manteiga com/sem sal', '9g', 2),
    (v_g, 'Óleo de soja', '8ml', 3),
    (v_g, 'Óleo de coco', '8ml', 4),
    (v_g, 'Óleo de canola', '8ml', 5),
    (v_g, 'Óleo de linhaça', '8ml', 6),
    (v_g, 'Castanha do Pará', '10g', 7),
    (v_g, 'Castanha de cajú torrada', '12g', 8);

  -- Grupo 5
  INSERT INTO public.lista_subst_grupos (org_id, numero, nome) VALUES (v_org, 5, 'Alimentos Gordurosos') RETURNING id INTO v_g;
  INSERT INTO public.lista_subst_itens (grupo_id, nome, porcao, ordem) VALUES
    (v_g, 'Azeitona preta', '32g', 1),
    (v_g, 'Azeitona verde', '45g', 2),
    (v_g, 'Bacon industrializado', '17g', 3),
    (v_g, 'Cream Cheese Light', '30g', 4),
    (v_g, 'Cream Cheese', '22g', 5),
    (v_g, 'Requeijão light', '35g', 6),
    (v_g, 'Requeijão', '25g', 7),
    (v_g, 'Creme de leite', '35g', 8),
    (v_g, 'Creme de leite zero lac', '35g', 9),
    (v_g, 'Gema de ovo cozida', '18g', 10);

  -- Grupo 6
  INSERT INTO public.lista_subst_grupos (org_id, numero, nome) VALUES (v_org, 6, 'Frutas Comuns') RETURNING id INTO v_g;
  INSERT INTO public.lista_subst_itens (grupo_id, nome, porcao, ordem) VALUES
    (v_g, 'Abacaxi cru', '100g', 1),
    (v_g, 'Acerola', '150g', 2),
    (v_g, 'Ameixa crua', '90g', 3),
    (v_g, 'Atemóia', '50g', 4),
    (v_g, 'Banana da terra', '40g', 5),
    (v_g, 'Banana maçã', '55g', 6),
    (v_g, 'Banana prata', '50g', 7),
    (v_g, 'Banana nanica', '55g', 8),
    (v_g, 'Caju cru', '115g', 9),
    (v_g, 'Cajá', '105g', 10),
    (v_g, 'Carambola', '105g', 11),
    (v_g, 'Caqui', '65g', 12),
    (v_g, 'Cereja', '75g', 13),
    (v_g, 'Ciriguela', '65g', 14),
    (v_g, 'Goiaba vermelha', '90g', 15),
    (v_g, 'Cupuaçu', '105g', 16),
    (v_g, 'Framboesa', '105g', 17),
    (v_g, 'Graviola', '80g', 18),
    (v_g, 'Jabuticaba', '85g', 19),
    (v_g, 'Jaca', '55g', 20),
    (v_g, 'Jambo', '180g', 21),
    (v_g, 'Kiwi', '100g', 22),
    (v_g, 'Laranja lima', '105g', 23),
    (v_g, 'Laranja pêra', '135g', 24),
    (v_g, 'Limão tahiti', '130g', 25),
    (v_g, 'Mamão Formosa', '105g', 26),
    (v_g, 'Mamão papaia', '120g', 27),
    (v_g, 'Manga Palmer', '65g', 28),
    (v_g, 'Manga Tommy Atkins', '95g', 29),
    (v_g, 'Manga Haden', '75g', 30),
    (v_g, 'Maracujá', '80g', 31),
    (v_g, 'Maçã Fuji', '85g', 32),
    (v_g, 'Melancia', '145g', 33),
    (v_g, 'Melão', '165g', 34),
    (v_g, 'Mirtilo ou Blueberry', '80g', 35),
    (v_g, 'Morango', '160g', 36),
    (v_g, 'Mexerica Rio', '130g', 37),
    (v_g, 'Pera Park crua', '80g', 38),
    (v_g, 'Pêssego', '130g', 39),
    (v_g, 'Pêssego enlatado', '75g', 40),
    (v_g, 'Pitanga', '120g', 41),
    (v_g, 'Pinha', '55g', 42),
    (v_g, 'Tangerina poncã', '130g', 43),
    (v_g, 'Umbu', '130g', 44),
    (v_g, 'Tamarindo', '20g', 45),
    (v_g, 'Uva passa', '14g', 46),
    (v_g, 'Uva Rubi ou Itália', '100g', 47),
    (v_g, 'Água de côco', '240ml', 48);

  -- Grupo 7
  INSERT INTO public.lista_subst_grupos (org_id, numero, nome) VALUES (v_org, 7, 'Frutas Oleosas e Outros') RETURNING id INTO v_g;
  INSERT INTO public.lista_subst_itens (grupo_id, nome, porcao, ordem) VALUES
    (v_g, 'Abacate', '60g', 1),
    (v_g, 'Chocolate 70% cacau', '12g', 2),
    (v_g, 'Côco cru', '13g', 3),
    (v_g, 'Pequi', '28g', 4),
    (v_g, 'Polpa de açaí congelada', '100g', 5);

  -- Grupo 8
  INSERT INTO public.lista_subst_grupos (org_id, numero, nome) VALUES (v_org, 8, 'Nozes e Sementes') RETURNING id INTO v_g;
  INSERT INTO public.lista_subst_itens (grupo_id, nome, porcao, ordem) VALUES
    (v_g, 'Amendoim cru', '20g', 1),
    (v_g, 'Amendoim torrado com sal', '18g', 2),
    (v_g, 'Amêndoa torrada', '20g', 3),
    (v_g, 'Castanha de caju', '20g', 4),
    (v_g, 'Castanha-do-Brasil/Pará crua', '18g', 5),
    (v_g, 'Farinha de amêndoa', '18g', 6),
    (v_g, 'Farinha de linhaça dourada', '25g', 7),
    (v_g, 'Leite de amêndoas', '350ml', 8),
    (v_g, 'Pasta de amendoim integral', '20g', 9),
    (v_g, 'Pistache torrado com sal e sem sal', '20g', 10),
    (v_g, 'Semente de chia', '30g', 11),
    (v_g, 'Semente de linhaça', '25g', 12),
    (v_g, 'Semente de gergelim', '19g', 13),
    (v_g, 'Semente de girasol', '19g', 14);

  -- Grupo 9
  INSERT INTO public.lista_subst_grupos (org_id, numero, nome) VALUES (v_org, 9, 'Pães e Fibras') RETURNING id INTO v_g;
  INSERT INTO public.lista_subst_itens (grupo_id, nome, porcao, ordem) VALUES
    (v_g, 'Amido de milho cru', '16g', 1),
    (v_g, 'Aveia em flocos', '16g', 2),
    (v_g, 'Barra de cereal', '15g', 3),
    (v_g, 'Bolacha cream cracker', '12g', 4),
    (v_g, 'Biscoito maisena', '14g', 5),
    (v_g, 'Biscoito de polvilho doce', '14g', 6),
    (v_g, 'Biscoito de arroz', '15g', 7),
    (v_g, 'Farinha de linhaça', '14g', 8),
    (v_g, 'Cuscuz de milho cozido', '50g', 9),
    (v_g, 'Farinha de mandioca', '15g', 10),
    (v_g, 'Farelo de aveia', '17g', 11),
    (v_g, 'Granola', '16g', 12),
    (v_g, 'Farinha de aveia', '16g', 13),
    (v_g, 'Milho para pipoca', '15g', 14),
    (v_g, 'Goma de tapioca', '22g', 15),
    (v_g, 'Pão de forma de milho', '22g', 16),
    (v_g, 'Leite de aveia', '120ml', 17),
    (v_g, 'Pão de forma sem gluten', '25g', 18),
    (v_g, 'Polvilho doce', '15g', 19),
    (v_g, 'Pão de forma tradicional', '22g', 20),
    (v_g, 'Pão de forma integral', '25g', 21),
    (v_g, 'Pão tipo folha/rap', '20g', 22),
    (v_g, 'Pão francês', '18g', 23);

  -- Grupo 10
  INSERT INTO public.lista_subst_grupos (org_id, numero, nome) VALUES (v_org, 10, 'Laticínios e Derivados') RETURNING id INTO v_g;
  INSERT INTO public.lista_subst_itens (grupo_id, nome, porcao, ordem) VALUES
    (v_g, 'Coalhada Natural', '170g', 1),
    (v_g, 'Coalhada desnatada', '250g', 2),
    (v_g, 'Creme de ricota light', '70g', 3),
    (v_g, 'Creme de ricotta', '50g', 4),
    (v_g, 'Iogurte grego desnatado', '200g', 5),
    (v_g, 'Iogurte natural desnatado', '320g', 6),
    (v_g, 'Iogurte natural proteico', '170g', 7),
    (v_g, 'Iogurte natural sem lactose', '170g', 8),
    (v_g, 'Iogurte natural integral', '170g', 9),
    (v_g, 'Leite semidesnatado em pó', '25g', 10),
    (v_g, 'Leite semidesnatado', '250ml', 11),
    (v_g, 'Leite UHT semidesnatado zero lactose', '250ml', 12),
    (v_g, 'Leite de vaca desnatado UHT', '300ml', 13),
    (v_g, 'Leite de vaca desnatado em pó', '30g', 14),
    (v_g, 'Leite de vaca integral UHT', '150ml', 15),
    (v_g, 'Leite de vaca integral em pó', '20g', 16),
    (v_g, 'Queijo coalho', '34g', 17),
    (v_g, 'Queijo minas frescal light', '50g', 18),
    (v_g, 'Queijo minas frescal', '4g', 19),
    (v_g, 'Queijo muçarela', '30g', 20),
    (v_g, 'Queijo parmesão', '24g', 21),
    (v_g, 'Queijo prato', '30g', 22),
    (v_g, 'Queijo tipo cottage', '104g', 23),
    (v_g, 'Queijo tipo cottage zero lactose', '104g', 24),
    (v_g, 'Queijo tipo ricota', '70g', 25),
    (v_g, 'Requeijão cremoso', '40g', 26),
    (v_g, 'Requeijão light', '54g', 27);

  -- Grupo 11
  INSERT INTO public.lista_subst_grupos (org_id, numero, nome) VALUES (v_org, 11, 'Suplementos Alimentares') RETURNING id INTO v_g;
  INSERT INTO public.lista_subst_itens (grupo_id, nome, porcao, ordem) VALUES
    (v_g, 'Whey protein concentrado', '15g', 1),
    (v_g, 'Whey protein hidrolisado', '15g', 2),
    (v_g, 'Whey protein isolado, concentrado e hidrolisado', '15g', 3),
    (v_g, 'Whey protein isolado', '15g', 4),
    (v_g, 'Proteína isolada da carne', '15g', 5),
    (v_g, 'Caseina', '17g', 6),
    (v_g, 'Proteína isolada de soja', '15g', 7),
    (v_g, 'Proteína isolada do arroz', '15g', 8);

  -- Grupo 12
  INSERT INTO public.lista_subst_grupos (org_id, numero, nome) VALUES (v_org, 12, 'Açúcares') RETURNING id INTO v_g;
  INSERT INTO public.lista_subst_itens (grupo_id, nome, porcao, ordem) VALUES
    (v_g, 'Achocolatado em pó', '15g', 1),
    (v_g, 'Açúcar demerara', '15g', 2),
    (v_g, 'Açúcar light', '15g', 3),
    (v_g, 'Açúcar mascavo', '15g', 4),
    (v_g, 'Açúcar cristal', '15g', 5),
    (v_g, 'Dextrose', '15g', 6),
    (v_g, 'Isomaltulose (Palatinose)', '15g', 7),
    (v_g, 'Mel', '18g', 8),
    (v_g, 'Waxy Maize', '16g', 9),
    (v_g, 'Leite condensado', '20g', 10),
    (v_g, 'Leite condensado light', '20g', 11),
    (v_g, 'Leite condensado zero lactose', '20g', 12),
    (v_g, 'Doce de leite', '18g', 13);

  -- Grupo 13 (vegetais livres — sem porção)
  INSERT INTO public.lista_subst_grupos (org_id, numero, nome) VALUES (v_org, 13, 'Vegetais A ou Folhosos') RETURNING id INTO v_g;
  INSERT INTO public.lista_subst_itens (grupo_id, nome, porcao, ordem) VALUES
    (v_g, 'Acelga', NULL, 1),
    (v_g, 'Agrião', NULL, 2),
    (v_g, 'Alface crespa/lisa/americana', NULL, 3),
    (v_g, 'Alface roxa', NULL, 4),
    (v_g, 'Alho poró', NULL, 5),
    (v_g, 'Almeirão cru', NULL, 6),
    (v_g, 'Aspargo cozido', NULL, 7),
    (v_g, 'Bertalha refogada', NULL, 8),
    (v_g, 'Broto de alfafa', NULL, 9),
    (v_g, 'Chicória', NULL, 10),
    (v_g, 'Couve manteiga crua', NULL, 11),
    (v_g, 'Couve refogada', NULL, 12),
    (v_g, 'Espinafre cru', NULL, 13),
    (v_g, 'Espinafre refogado', NULL, 14),
    (v_g, 'Folha de mostarda', NULL, 15),
    (v_g, 'Folhas de brócolis', NULL, 16),
    (v_g, 'Jambu', NULL, 17),
    (v_g, 'Pepino cru', NULL, 18),
    (v_g, 'Rabanete cru', NULL, 19),
    (v_g, 'Repolho branco cru', NULL, 20),
    (v_g, 'Repolho refogado', NULL, 21),
    (v_g, 'Repolho roxo cru', NULL, 22),
    (v_g, 'Rúcula', NULL, 23),
    (v_g, 'Salada de folhas (alface lisa, roxa e rúcula)', NULL, 24),
    (v_g, 'Taioba', NULL, 25);

  -- Grupo 14 (vegetais livres — sem porção)
  INSERT INTO public.lista_subst_grupos (org_id, numero, nome) VALUES (v_org, 14, 'Vegetais B ou Hortaliças') RETURNING id INTO v_g;
  INSERT INTO public.lista_subst_itens (grupo_id, nome, porcao, ordem) VALUES
    (v_g, 'Abobrinha italiana cozida', NULL, 1),
    (v_g, 'Abobrinha italiana refogada', NULL, 2),
    (v_g, 'Abóbora cabotian cozida', NULL, 3),
    (v_g, 'Abóbora moranga cozida', NULL, 4),
    (v_g, 'Alcachofra cozida', NULL, 5),
    (v_g, 'Berinjela cozida', NULL, 6),
    (v_g, 'Beterraba cozida', NULL, 7),
    (v_g, 'Beterraba crua', NULL, 8),
    (v_g, 'Broto de bambu cru', NULL, 9),
    (v_g, 'Broto de feijão cru', NULL, 10),
    (v_g, 'Brócolis cozido', NULL, 11),
    (v_g, 'Cebola cozida', NULL, 12),
    (v_g, 'Cenoura baby', NULL, 13),
    (v_g, 'Cenoura cozida', NULL, 14),
    (v_g, 'Cenoura crua', NULL, 15),
    (v_g, 'Chuchu cozido', NULL, 16),
    (v_g, 'Couve-flor cozida', NULL, 17),
    (v_g, 'Jiló cozido', NULL, 18),
    (v_g, 'Palmito pupunha em conserva', NULL, 19),
    (v_g, 'Pepino cru', NULL, 20),
    (v_g, 'Pimentão amarelo cru', NULL, 21),
    (v_g, 'Pimentão verde cru', NULL, 22),
    (v_g, 'Pimentão vermelho cru', NULL, 23),
    (v_g, 'Quiabo cozido', NULL, 24),
    (v_g, 'Rabanete cru', NULL, 25),
    (v_g, 'Tomate cereja', NULL, 26),
    (v_g, 'Tomate salada', NULL, 27),
    (v_g, 'Vagem cozida', NULL, 28);

END $$;
