-- Migration: 20260416000001_diet_tables.sql
-- Diet and food substitution system

-- ============================================================
-- 1. CREATE TABLES
-- ============================================================

-- substitution_groups: global reference, not org-specific
CREATE TABLE IF NOT EXISTS public.substitution_groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

-- substitution_foods: global reference
CREATE TABLE IF NOT EXISTS public.substitution_foods (
  id SERIAL PRIMARY KEY,
  group_id INTEGER REFERENCES public.substitution_groups(id),
  name TEXT NOT NULL,
  portion TEXT
);

-- diets: one per student, org-scoped
CREATE TABLE IF NOT EXISTS public.diets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  calories INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- diet_meals
CREATE TABLE IF NOT EXISTS public.diet_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diet_id UUID REFERENCES public.diets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  time_suggestion TEXT,
  order_index INTEGER DEFAULT 0,
  notes TEXT
);

-- diet_meal_foods
CREATE TABLE IF NOT EXISTS public.diet_meal_foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id UUID REFERENCES public.diet_meals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  portion TEXT,
  substitution_group_id INTEGER REFERENCES public.substitution_groups(id),
  order_index INTEGER DEFAULT 0
);

-- ============================================================
-- 2. ENABLE RLS ON ALL NEW TABLES
-- ============================================================

ALTER TABLE public.substitution_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substitution_foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diet_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diet_meal_foods ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. HELPER FUNCTIONS (SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_diet_trainer(p_diet_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.diets d
    JOIN public.alunos a ON a.user_id = d.student_id
    WHERE d.id = p_diet_id AND a.treinador_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_diet_student(p_diet_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.diets WHERE id = p_diet_id AND student_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.meal_diet_id(p_meal_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT diet_id FROM public.diet_meals WHERE id = p_meal_id
$$;

-- ============================================================
-- 4. RLS POLICIES
-- ============================================================

-- substitution_groups: authenticated users can SELECT (public read)
CREATE POLICY "substitution_groups_select" ON public.substitution_groups
  FOR SELECT TO authenticated USING (true);

-- substitution_foods: authenticated users can SELECT (public read)
CREATE POLICY "substitution_foods_select" ON public.substitution_foods
  FOR SELECT TO authenticated USING (true);

-- diets: trainer ALL, student SELECT
CREATE POLICY "diets_trainer_all" ON public.diets
  FOR ALL TO authenticated USING (public.is_diet_trainer(id));

CREATE POLICY "diets_student_select" ON public.diets
  FOR SELECT TO authenticated USING (student_id = auth.uid());

-- diet_meals: trainer ALL, student SELECT
CREATE POLICY "diet_meals_trainer_all" ON public.diet_meals
  FOR ALL TO authenticated USING (public.is_diet_trainer(diet_id));

CREATE POLICY "diet_meals_student_select" ON public.diet_meals
  FOR SELECT TO authenticated USING (public.is_diet_student(diet_id));

-- diet_meal_foods: trainer ALL, student SELECT
CREATE POLICY "diet_meal_foods_trainer_all" ON public.diet_meal_foods
  FOR ALL TO authenticated USING (public.is_diet_trainer(public.meal_diet_id(meal_id)));

CREATE POLICY "diet_meal_foods_student_select" ON public.diet_meal_foods
  FOR SELECT TO authenticated USING (public.is_diet_student(public.meal_diet_id(meal_id)));

-- ============================================================
-- 5. UPDATED_AT TRIGGER FOR DIETS
-- ============================================================

CREATE TRIGGER diets_updated_at
  BEFORE UPDATE ON public.diets
  FOR EACH ROW EXECUTE FUNCTION public.update_organizations_updated_at();

-- ============================================================
-- 6. SEED DATA — SUBSTITUTION GROUPS AND FOODS
-- ============================================================

INSERT INTO public.substitution_groups (id, name) VALUES
  (1, 'Carnes e Proteínas'),
  (2, 'Cereais e Tubérculos'),
  (3, 'Feijão e Leguminosas'),
  (4, 'Óleos e Gorduras'),
  (5, 'Alimentos Gordurosos'),
  (6, 'Frutas Comuns'),
  (7, 'Frutas Oleosas e Outros'),
  (8, 'Nozes e Sementes'),
  (9, 'Pães e Fibras'),
  (10, 'Laticínios e Derivados'),
  (11, 'Suplementos Alimentares'),
  (12, 'Açúcares'),
  (13, 'Vegetais A Folhosos'),
  (14, 'Vegetais B Hortaliças')
ON CONFLICT (id) DO NOTHING;

-- GROUP 1 — Carnes e Proteínas
INSERT INTO public.substitution_foods (group_id, name, portion) VALUES
  (1, 'Atum sólido em água', '70g'),
  (1, 'Bacalhau cru', '60g'),
  (1, 'Camarão rio grande cozido', '90g'),
  (1, 'Caranguejo cozido', '95g'),
  (1, 'Contrafilé sem gordura grelhado', '40g'),
  (1, 'Coxa de frango sem pele cozida', '50g'),
  (1, 'Clara de ovo cozida 5 unidades', '150g'),
  (1, 'Coxão mole sem gordura cozido', '40g'),
  (1, 'Filé de Merluza assado', '65g'),
  (1, 'Filé de frango grelhado', '50g'),
  (1, 'Filé de tilápia grelhada', '65g'),
  (1, 'Filé de pescada frito', '55g'),
  (1, 'Lombo de porco assado', '40g'),
  (1, 'Filé mignon sem gordura grelhado', '40g'),
  (1, 'Patinho sem gordura grelhado', '40g'),
  (1, 'Maminha grelhada', '50g'),
  (1, 'Pescada branca frita', NULL),
  (1, 'Peito de peru defumado', '80g'),
  (1, 'Presunto sem capa de gordura', '90g'),
  (1, 'Sardinha assada', '50g');

-- GROUP 2 — Cereais e Tubérculos
INSERT INTO public.substitution_foods (group_id, name, portion) VALUES
  (2, 'Arroz branco cozido', '25g'),
  (2, 'Arroz integral cozido', '25g'),
  (2, 'Batata baroa/Mandioquinha cozida', '40g'),
  (2, 'Batata doce cozida', '40g'),
  (2, 'Batata inglesa cozida', '60g'),
  (2, 'Batata inglesa crua', '50g'),
  (2, 'Cará cozido', '40g'),
  (2, 'Inhame cru', '30g'),
  (2, 'Farinha de arroz', '10g'),
  (2, 'Macarrão cozido', '22g'),
  (2, 'Macarrão de arroz cru', '10g'),
  (2, 'Macarrão integral cozido', '25g'),
  (2, 'Mandioca/macaxeira cozida', '25g'),
  (2, 'Milho verde enlatado conserva', '75g'),
  (2, 'Quinoa cozida', '30g');

-- GROUP 3 — Feijão e Leguminosas
INSERT INTO public.substitution_foods (group_id, name, portion) VALUES
  (3, 'Ervilha em vagem', '42g'),
  (3, 'Ervilha em conserva', '42g'),
  (3, 'Feijão Fradinho/verde cozido', '50g'),
  (3, 'Feijão Jalo cozido', '40g'),
  (3, 'Feijão carioca cozido', '50g'),
  (3, 'Feijão preto cozido', '50g'),
  (3, 'Lentilha cozida', '40g'),
  (3, 'Grão de bico cru', '10g');

-- GROUP 4 — Óleos e Gorduras
INSERT INTO public.substitution_foods (group_id, name, portion) VALUES
  (4, 'Azeite de oliva', '8ml'),
  (4, 'Manteiga com/sem sal', '9g'),
  (4, 'Óleo de soja', '8ml'),
  (4, 'Óleo de coco', '8ml'),
  (4, 'Óleo de canola', '8ml'),
  (4, 'Óleo de linhaça', '8ml'),
  (4, 'Castanha do Pará', '10g'),
  (4, 'Castanha de cajú torrada', '12g');

-- GROUP 5 — Alimentos Gordurosos
INSERT INTO public.substitution_foods (group_id, name, portion) VALUES
  (5, 'Azeitona preta', '32g'),
  (5, 'Azeitona verde', '45g'),
  (5, 'Bacon industrializado', '17g'),
  (5, 'Cream Cheese Light', '30g'),
  (5, 'Cream Cheese', '22g'),
  (5, 'Requeijão light', '35g'),
  (5, 'Requeijão', '25g'),
  (5, 'Creme de leite', '35g'),
  (5, 'Creme de leite zero lac', '35g'),
  (5, 'Gema de ovo cozida', '18g');

-- GROUP 6 — Frutas Comuns
INSERT INTO public.substitution_foods (group_id, name, portion) VALUES
  (6, 'Abacaxi cru', '100g'),
  (6, 'Acerola', '150g'),
  (6, 'Ameixa crua', '90g'),
  (6, 'Atemóia', '50g'),
  (6, 'Banana da terra', '40g'),
  (6, 'Banana maçã', '55g'),
  (6, 'Banana prata', '50g'),
  (6, 'Banana nanica', '55g'),
  (6, 'Caju cru', '115g'),
  (6, 'Cajá', '105g'),
  (6, 'Carambola', '105g'),
  (6, 'Caqui', '65g'),
  (6, 'Cereja', '75g'),
  (6, 'Ciriguela', '65g'),
  (6, 'Goiaba vermelha', '90g'),
  (6, 'Cupuaçu', '105g'),
  (6, 'Framboesa', '105g'),
  (6, 'Graviola', '80g'),
  (6, 'Jabuticaba', '85g'),
  (6, 'Jaca', '55g'),
  (6, 'Jambo', '180g'),
  (6, 'Kiwi', '100g'),
  (6, 'Laranja lima', '105g'),
  (6, 'Laranja pêra', '135g'),
  (6, 'Limão tahiti', '130g'),
  (6, 'Mamão Formosa', '105g'),
  (6, 'Mamão papaia', '120g'),
  (6, 'Manga Palmer', '65g'),
  (6, 'Manga Tommy Atkins', '95g'),
  (6, 'Manga Haden', '75g'),
  (6, 'Maracujá', '80g'),
  (6, 'Maçã Fuji', '85g'),
  (6, 'Melancia', '145g'),
  (6, 'Melão', '165g'),
  (6, 'Mirtilo/Blueberry', '80g'),
  (6, 'Morango', '160g'),
  (6, 'Mexerica Rio', '130g'),
  (6, 'Pera Park crua', '80g'),
  (6, 'Pêssego', '130g'),
  (6, 'Pêssego enlatado', '75g'),
  (6, 'Pitanga', '120g'),
  (6, 'Pinha', '55g'),
  (6, 'Tangerina poncã', '130g'),
  (6, 'Umbu', '130g'),
  (6, 'Tamarindo', '20g'),
  (6, 'Uva passa', '14g'),
  (6, 'Uva Rubi ou Itália', '100g'),
  (6, 'Água de côco', '240ml');

-- GROUP 7 — Frutas Oleosas e Outros
INSERT INTO public.substitution_foods (group_id, name, portion) VALUES
  (7, 'Abacate', '60g'),
  (7, 'Chocolate 70% cacau', '12g'),
  (7, 'Côco cru', '13g'),
  (7, 'Pequi', '28g'),
  (7, 'Polpa de açaí congelada', '100g');

-- GROUP 8 — Nozes e Sementes
INSERT INTO public.substitution_foods (group_id, name, portion) VALUES
  (8, 'Amendoim cru', '20g'),
  (8, 'Amendoim torrado com sal', '18g'),
  (8, 'Amêndoa torrada', '20g'),
  (8, 'Castanha de caju', '20g'),
  (8, 'Castanha-do-Brasil/Pará crua', '18g'),
  (8, 'Farinha de amêndoa', '18g'),
  (8, 'Farinha de linhaça dourada', '25g'),
  (8, 'Leite de amêndoas', '350ml'),
  (8, 'Pasta de amendoim integral', '20g'),
  (8, 'Pistache torrado com/sem sal', '20g'),
  (8, 'Semente de chia', '30g'),
  (8, 'Semente de linhaça', '25g'),
  (8, 'Semente de gergelim', '19g'),
  (8, 'Semente de girasol', '19g');

-- GROUP 9 — Pães e Fibras
INSERT INTO public.substitution_foods (group_id, name, portion) VALUES
  (9, 'Amido de milho cru', '16g'),
  (9, 'Aveia em flocos', '16g'),
  (9, 'Barra de cereal', '15g'),
  (9, 'Bolacha cream cracker', '12g'),
  (9, 'Biscoito maisena', '14g'),
  (9, 'Biscoito de polvilho doce', '14g'),
  (9, 'Biscoito de arroz', '15g'),
  (9, 'Farinha de linhaça', '14g'),
  (9, 'Cuscuz de milho cozido', '50g'),
  (9, 'Farinha de mandioca', '15g'),
  (9, 'Farelo de aveia', '17g'),
  (9, 'Granola', '16g'),
  (9, 'Farinha de aveia', '16g'),
  (9, 'Milho para pipoca', '15g'),
  (9, 'Goma de tapioca', '22g'),
  (9, 'Pão de forma de milho', '22g'),
  (9, 'Leite de aveia', '120ml'),
  (9, 'Pão de forma sem glúten', '25g'),
  (9, 'Polvilho doce', '15g'),
  (9, 'Pão de forma tradicional', '22g'),
  (9, 'Pão de forma integral', '25g'),
  (9, 'Pão tipo folha/rap', '20g'),
  (9, 'Pão francês', '18g');

-- GROUP 10 — Laticínios e Derivados
INSERT INTO public.substitution_foods (group_id, name, portion) VALUES
  (10, 'Coalhada Natural', '170g'),
  (10, 'Coalhada desnatada', '250g'),
  (10, 'Creme de ricota light', '70g'),
  (10, 'Creme de ricotta', '50g'),
  (10, 'Iogurte grego desnatado', '200g'),
  (10, 'Iogurte natural desnatado', '320g'),
  (10, 'Iogurte natural proteico', '170g'),
  (10, 'Iogurte natural sem lactose', '170g'),
  (10, 'Iogurte natural integral', '170g'),
  (10, 'Leite semidesnatado em pó', '25g'),
  (10, 'Leite semidesnatado', '250ml'),
  (10, 'Leite UHT semidesnatado zero lactose', '250ml'),
  (10, 'Leite de vaca desnatado UHT', '300ml'),
  (10, 'Leite de vaca desnatado em pó', '30g'),
  (10, 'Leite de vaca integral UHT', '150ml'),
  (10, 'Leite de vaca integral em pó', '20g'),
  (10, 'Queijo coalho', '34g'),
  (10, 'Queijo minas frescal light', '50g'),
  (10, 'Queijo minas frescal', '4g'),
  (10, 'Queijo muçarela', '30g'),
  (10, 'Queijo parmesão', '24g'),
  (10, 'Queijo prato', '30g'),
  (10, 'Queijo tipo cottage', '104g'),
  (10, 'Queijo tipo cottage zero lactose', '104g'),
  (10, 'Queijo tipo ricota', '70g'),
  (10, 'Requeijão cremoso', '40g'),
  (10, 'Requeijão light', '54g');

-- GROUP 11 — Suplementos Alimentares
INSERT INTO public.substitution_foods (group_id, name, portion) VALUES
  (11, 'Whey protein concentrado', '15g'),
  (11, 'Whey protein hidrolisado', '15g'),
  (11, 'Whey protein isolado concentrado e hidrolisado', '15g'),
  (11, 'Whey protein isolado', '15g'),
  (11, 'Proteína isolada da carne', '15g'),
  (11, 'Caseína', '17g'),
  (11, 'Proteína isolada de soja', '15g'),
  (11, 'Proteína isolada do arroz', '15g');

-- GROUP 12 — Açúcares
INSERT INTO public.substitution_foods (group_id, name, portion) VALUES
  (12, 'Achocolatado em pó', '15g'),
  (12, 'Açúcar demerara', '15g'),
  (12, 'Açúcar light', '15g'),
  (12, 'Açúcar mascavo', '15g'),
  (12, 'Açúcar cristal', '15g'),
  (12, 'Dextrose', '15g'),
  (12, 'Isomaltulose/Palatinose', '15g'),
  (12, 'Mel', '18g'),
  (12, 'Waxy Maize', '16g'),
  (12, 'Leite condensado', '20g'),
  (12, 'Leite condensado light', '20g'),
  (12, 'Leite condensado zero lactose', '20g'),
  (12, 'Doce de leite', '18g');

-- GROUP 13 — Vegetais A Folhosos (no portions)
INSERT INTO public.substitution_foods (group_id, name, portion) VALUES
  (13, 'Acelga', NULL),
  (13, 'Agrião', NULL),
  (13, 'Alface crespa/lisa/americana', NULL),
  (13, 'Alface roxa', NULL),
  (13, 'Alho poró', NULL),
  (13, 'Almeirão cru', NULL),
  (13, 'Aspargo cozido', NULL),
  (13, 'Bertalha refogada', NULL),
  (13, 'Broto de alfafa', NULL),
  (13, 'Chicória', NULL),
  (13, 'Couve manteiga crua', NULL),
  (13, 'Couve refogada', NULL),
  (13, 'Espinafre cru', NULL),
  (13, 'Espinafre refogado', NULL),
  (13, 'Folha de mostarda', NULL),
  (13, 'Folhas de brócolis', NULL),
  (13, 'Jambu', NULL),
  (13, 'Pepino cru', NULL),
  (13, 'Rabanete cru', NULL),
  (13, 'Repolho branco cru', NULL),
  (13, 'Repolho refogado', NULL),
  (13, 'Repolho roxo cru', NULL),
  (13, 'Rúcula', NULL),
  (13, 'Salada de folhas', NULL),
  (13, 'Taioba', NULL);

-- GROUP 14 — Vegetais B Hortaliças (no portions)
INSERT INTO public.substitution_foods (group_id, name, portion) VALUES
  (14, 'Abobrinha italiana cozida', NULL),
  (14, 'Abobrinha italiana refogada', NULL),
  (14, 'Abóbora cabotiá cozida', NULL),
  (14, 'Abóbora moranga cozida', NULL),
  (14, 'Alcachofra cozida', NULL),
  (14, 'Berinjela cozida', NULL),
  (14, 'Beterraba cozida', NULL),
  (14, 'Beterraba crua', NULL),
  (14, 'Broto de bambu cru', NULL),
  (14, 'Broto de feijão cru', NULL),
  (14, 'Brócolis cozido', NULL),
  (14, 'Cebola cozida', NULL),
  (14, 'Cenoura baby', NULL),
  (14, 'Cenoura cozida', NULL),
  (14, 'Cenoura crua', NULL),
  (14, 'Chuchu cozido', NULL),
  (14, 'Couve-flor cozida', NULL),
  (14, 'Jiló cozido', NULL),
  (14, 'Palmito pupunha em conserva', NULL),
  (14, 'Pepino cru', NULL),
  (14, 'Pimentão amarelo cru', NULL),
  (14, 'Pimentão verde cru', NULL),
  (14, 'Pimentão vermelho cru', NULL),
  (14, 'Quiabo cozido', NULL),
  (14, 'Rabanete cru', NULL),
  (14, 'Tomate cereja', NULL),
  (14, 'Tomate salada', NULL),
  (14, 'Vagem cozida', NULL);
