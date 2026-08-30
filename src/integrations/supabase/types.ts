export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      active_timers: {
        Row: {
          created_at: string
          duracao_segundos: number
          notified_at: string | null
          org_id: string | null
          paused_at: string | null
          ref_id: string | null
          started_at: string
          student_id: string
          tipo: string
          titulo: string
        }
        Insert: {
          created_at?: string
          duracao_segundos: number
          notified_at?: string | null
          org_id?: string | null
          paused_at?: string | null
          ref_id?: string | null
          started_at?: string
          student_id: string
          tipo: string
          titulo: string
        }
        Update: {
          created_at?: string
          duracao_segundos?: number
          notified_at?: string | null
          org_id?: string | null
          paused_at?: string | null
          ref_id?: string | null
          started_at?: string
          student_id?: string
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_timers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agendamentos: {
        Row: {
          aluno_id: string | null
          created_at: string | null
          data_hora: string
          descricao: string | null
          duracao_minutos: number | null
          id: string
          org_id: string | null
          status: string | null
          tipo: string | null
          titulo: string
          treinador_id: string | null
        }
        Insert: {
          aluno_id?: string | null
          created_at?: string | null
          data_hora: string
          descricao?: string | null
          duracao_minutos?: number | null
          id?: string
          org_id?: string | null
          status?: string | null
          tipo?: string | null
          titulo: string
          treinador_id?: string | null
        }
        Update: {
          aluno_id?: string | null
          created_at?: string | null
          data_hora?: string
          descricao?: string | null
          duracao_minutos?: number | null
          id?: string
          org_id?: string | null
          status?: string | null
          tipo?: string | null
          titulo?: string
          treinador_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_conversations: {
        Row: {
          content: string
          created_at: string
          id: string
          org_id: string
          role: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          org_id: string
          role: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          org_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      alimentos: {
        Row: {
          acucar_g: number | null
          calcio_mg: number | null
          carb_g: number | null
          colesterol_mg: number | null
          created_at: string | null
          criado_por: string | null
          ferro_mg: number | null
          fibra_g: number | null
          fonte: string | null
          gordura_g: number | null
          gordura_mono_g: number | null
          gordura_poli_g: number | null
          gordura_saturada_g: number | null
          gordura_trans_g: number | null
          gramas_por_unidade: number | null
          id: string
          kcal: number | null
          nome: string
          org_id: string | null
          porcao_descricao: string | null
          porcao_gramas: number | null
          potassio_mg: number | null
          proteina_g: number | null
          sodio_mg: number | null
          source: string | null
          status: string | null
          unidade: string
          vitamina_a_ug: number | null
          vitamina_c_mg: number | null
        }
        Insert: {
          acucar_g?: number | null
          calcio_mg?: number | null
          carb_g?: number | null
          colesterol_mg?: number | null
          created_at?: string | null
          criado_por?: string | null
          ferro_mg?: number | null
          fibra_g?: number | null
          fonte?: string | null
          gordura_g?: number | null
          gordura_mono_g?: number | null
          gordura_poli_g?: number | null
          gordura_saturada_g?: number | null
          gordura_trans_g?: number | null
          gramas_por_unidade?: number | null
          id?: string
          kcal?: number | null
          nome: string
          org_id?: string | null
          porcao_descricao?: string | null
          porcao_gramas?: number | null
          potassio_mg?: number | null
          proteina_g?: number | null
          sodio_mg?: number | null
          source?: string | null
          status?: string | null
          unidade?: string
          vitamina_a_ug?: number | null
          vitamina_c_mg?: number | null
        }
        Update: {
          acucar_g?: number | null
          calcio_mg?: number | null
          carb_g?: number | null
          colesterol_mg?: number | null
          created_at?: string | null
          criado_por?: string | null
          ferro_mg?: number | null
          fibra_g?: number | null
          fonte?: string | null
          gordura_g?: number | null
          gordura_mono_g?: number | null
          gordura_poli_g?: number | null
          gordura_saturada_g?: number | null
          gordura_trans_g?: number | null
          gramas_por_unidade?: number | null
          id?: string
          kcal?: number | null
          nome?: string
          org_id?: string | null
          porcao_descricao?: string | null
          porcao_gramas?: number | null
          potassio_mg?: number | null
          proteina_g?: number | null
          sodio_mg?: number | null
          source?: string | null
          status?: string | null
          unidade?: string
          vitamina_a_ug?: number | null
          vitamina_c_mg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "alimentos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      alongamentos: {
        Row: {
          aluno_id: string
          created_at: string | null
          duracao_segundos: number | null
          grupos_musculares: string | null
          id: string
          instrucoes: string | null
          nome: string
          org_id: string | null
          series: number | null
          video_url: string | null
        }
        Insert: {
          aluno_id: string
          created_at?: string | null
          duracao_segundos?: number | null
          grupos_musculares?: string | null
          id?: string
          instrucoes?: string | null
          nome: string
          org_id?: string | null
          series?: number | null
          video_url?: string | null
        }
        Update: {
          aluno_id?: string
          created_at?: string | null
          duracao_segundos?: number | null
          grupos_musculares?: string | null
          id?: string
          instrucoes?: string | null
          nome?: string
          org_id?: string | null
          series?: number | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alongamentos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alongamentos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      aluno_streaks: {
        Row: {
          melhor_sequencia: number
          org_id: string | null
          sequencia_atual: number
          student_id: string
          ultima_data_valida: string | null
          updated_at: string | null
        }
        Insert: {
          melhor_sequencia?: number
          org_id?: string | null
          sequencia_atual?: number
          student_id: string
          ultima_data_valida?: string | null
          updated_at?: string | null
        }
        Update: {
          melhor_sequencia?: number
          org_id?: string | null
          sequencia_atual?: number
          student_id?: string
          ultima_data_valida?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aluno_streaks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      alunos: {
        Row: {
          anamnese_dispensada: boolean | null
          anamnese_pendente: boolean | null
          ativo: boolean
          avaliacao_postural_pendente: boolean
          created_at: string | null
          data_expiracao_plano: string | null
          data_fim: string | null
          data_inicio: string | null
          data_proxima_atualizacao: string | null
          desativado_por_inadimplencia: boolean
          form_atualizacao_ultima_data: string | null
          form_atualizacao_url: string | null
          grace_last_notif_date: string | null
          id: string
          idade: number | null
          observacoes: string | null
          org_id: string | null
          plano_aluno_notif_0d: boolean
          plano_aluno_notif_1d: boolean
          plano_aluno_notif_5d: boolean
          plano_aluno_notif_7d: boolean
          plano_aluno_notif_vencido: boolean
          plano_cobranca_id: string | null
          plano_inicio: string | null
          plano_nome: string | null
          plano_produto_id: string | null
          plano_trainer_notif_0d: boolean
          plano_trainer_notif_1d: boolean
          plano_trainer_notif_5d: boolean
          plano_trainer_notif_7d: boolean
          plano_trainer_notif_vencido: boolean
          plano_valor_pago: number | null
          sexo: string | null
          telefone: string | null
          treinador_id: string
          user_id: string
        }
        Insert: {
          anamnese_dispensada?: boolean | null
          anamnese_pendente?: boolean | null
          ativo?: boolean
          avaliacao_postural_pendente?: boolean
          created_at?: string | null
          data_expiracao_plano?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          data_proxima_atualizacao?: string | null
          desativado_por_inadimplencia?: boolean
          form_atualizacao_ultima_data?: string | null
          form_atualizacao_url?: string | null
          grace_last_notif_date?: string | null
          id?: string
          idade?: number | null
          observacoes?: string | null
          org_id?: string | null
          plano_aluno_notif_0d?: boolean
          plano_aluno_notif_1d?: boolean
          plano_aluno_notif_5d?: boolean
          plano_aluno_notif_7d?: boolean
          plano_aluno_notif_vencido?: boolean
          plano_cobranca_id?: string | null
          plano_inicio?: string | null
          plano_nome?: string | null
          plano_produto_id?: string | null
          plano_trainer_notif_0d?: boolean
          plano_trainer_notif_1d?: boolean
          plano_trainer_notif_5d?: boolean
          plano_trainer_notif_7d?: boolean
          plano_trainer_notif_vencido?: boolean
          plano_valor_pago?: number | null
          sexo?: string | null
          telefone?: string | null
          treinador_id: string
          user_id: string
        }
        Update: {
          anamnese_dispensada?: boolean | null
          anamnese_pendente?: boolean | null
          ativo?: boolean
          avaliacao_postural_pendente?: boolean
          created_at?: string | null
          data_expiracao_plano?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          data_proxima_atualizacao?: string | null
          desativado_por_inadimplencia?: boolean
          form_atualizacao_ultima_data?: string | null
          form_atualizacao_url?: string | null
          grace_last_notif_date?: string | null
          id?: string
          idade?: number | null
          observacoes?: string | null
          org_id?: string | null
          plano_aluno_notif_0d?: boolean
          plano_aluno_notif_1d?: boolean
          plano_aluno_notif_5d?: boolean
          plano_aluno_notif_7d?: boolean
          plano_aluno_notif_vencido?: boolean
          plano_cobranca_id?: string | null
          plano_inicio?: string | null
          plano_nome?: string | null
          plano_produto_id?: string | null
          plano_trainer_notif_0d?: boolean
          plano_trainer_notif_1d?: boolean
          plano_trainer_notif_5d?: boolean
          plano_trainer_notif_7d?: boolean
          plano_trainer_notif_vencido?: boolean
          plano_valor_pago?: number | null
          sexo?: string | null
          telefone?: string | null
          treinador_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alunos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alunos_plano_cobranca_id_fkey"
            columns: ["plano_cobranca_id"]
            isOneToOne: false
            referencedRelation: "cobrancas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alunos_plano_produto_id_fkey"
            columns: ["plano_produto_id"]
            isOneToOne: false
            referencedRelation: "planos_produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alunos_treinador_id_fkey"
            columns: ["treinador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alunos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnese_templates: {
        Row: {
          created_at: string | null
          id: string
          introducao: string | null
          org_id: string | null
          perguntas: Json
        }
        Insert: {
          created_at?: string | null
          id?: string
          introducao?: string | null
          org_id?: string | null
          perguntas?: Json
        }
        Update: {
          created_at?: string | null
          id?: string
          introducao?: string | null
          org_id?: string | null
          perguntas?: Json
        }
        Relationships: [
          {
            foreignKeyName: "anamnese_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      anamneses: {
        Row: {
          alcool: string | null
          altura: string | null
          condicoes_saude: Json | null
          created_at: string | null
          desconforto_dor: string | null
          doencas: string | null
          estresse: string | null
          frequencia_treino: number | null
          frequencia_treino_opcao: string | null
          habitos_sono: string | null
          hidratacao_diaria: string | null
          historico_lesoes: string | null
          id: string
          idade: number | null
          lesoes_cirurgias: string | null
          medicamentos: string | null
          nivel_atividade: string | null
          nivel_estresse: string | null
          nome_completo: string | null
          objetivo: string | null
          observacoes: string | null
          org_id: string | null
          pendente: boolean | null
          peso_atual: number | null
          pratica_atividade: string | null
          qualidade_alimentacao: string | null
          respostas_extras: Json | null
          restricoes_alimentares: string | null
          sexo: string | null
          sono: string | null
          student_id: string | null
          suplementos: string | null
          tempo_por_sessao: string | null
          tempo_pratica: string | null
          tempo_treino_minutos: number | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          alcool?: string | null
          altura?: string | null
          condicoes_saude?: Json | null
          created_at?: string | null
          desconforto_dor?: string | null
          doencas?: string | null
          estresse?: string | null
          frequencia_treino?: number | null
          frequencia_treino_opcao?: string | null
          habitos_sono?: string | null
          hidratacao_diaria?: string | null
          historico_lesoes?: string | null
          id?: string
          idade?: number | null
          lesoes_cirurgias?: string | null
          medicamentos?: string | null
          nivel_atividade?: string | null
          nivel_estresse?: string | null
          nome_completo?: string | null
          objetivo?: string | null
          observacoes?: string | null
          org_id?: string | null
          pendente?: boolean | null
          peso_atual?: number | null
          pratica_atividade?: string | null
          qualidade_alimentacao?: string | null
          respostas_extras?: Json | null
          restricoes_alimentares?: string | null
          sexo?: string | null
          sono?: string | null
          student_id?: string | null
          suplementos?: string | null
          tempo_por_sessao?: string | null
          tempo_pratica?: string | null
          tempo_treino_minutos?: number | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          alcool?: string | null
          altura?: string | null
          condicoes_saude?: Json | null
          created_at?: string | null
          desconforto_dor?: string | null
          doencas?: string | null
          estresse?: string | null
          frequencia_treino?: number | null
          frequencia_treino_opcao?: string | null
          habitos_sono?: string | null
          hidratacao_diaria?: string | null
          historico_lesoes?: string | null
          id?: string
          idade?: number | null
          lesoes_cirurgias?: string | null
          medicamentos?: string | null
          nivel_atividade?: string | null
          nivel_estresse?: string | null
          nome_completo?: string | null
          objetivo?: string | null
          observacoes?: string | null
          org_id?: string | null
          pendente?: boolean | null
          peso_atual?: number | null
          pratica_atividade?: string | null
          qualidade_alimentacao?: string | null
          respostas_extras?: Json | null
          restricoes_alimentares?: string | null
          sexo?: string | null
          sono?: string | null
          student_id?: string | null
          suplementos?: string | null
          tempo_por_sessao?: string | null
          tempo_pratica?: string | null
          tempo_treino_minutos?: number | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anamneses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      anotacoes_aluno: {
        Row: {
          aluno_id: string
          created_at: string
          id: string
          org_id: string
          texto: string
          treinador_id: string | null
        }
        Insert: {
          aluno_id: string
          created_at?: string
          id?: string
          org_id: string
          texto: string
          treinador_id?: string | null
        }
        Update: {
          aluno_id?: string
          created_at?: string
          id?: string
          org_id?: string
          texto?: string
          treinador_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anotacoes_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anotacoes_aluno_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      asaas_customers_alunos: {
        Row: {
          aluno_id: string
          asaas_id: string
          asaas_subaccount_id: string | null
          created_at: string
          id: string
          org_id: string
        }
        Insert: {
          aluno_id: string
          asaas_id: string
          asaas_subaccount_id?: string | null
          created_at?: string
          id?: string
          org_id: string
        }
        Update: {
          aluno_id?: string
          asaas_id?: string
          asaas_subaccount_id?: string | null
          created_at?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asaas_customers_alunos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: true
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asaas_customers_alunos_asaas_subaccount_id_fkey"
            columns: ["asaas_subaccount_id"]
            isOneToOne: false
            referencedRelation: "asaas_subaccounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asaas_customers_alunos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      asaas_subaccount_withdrawals: {
        Row: {
          asaas_transfer_id: string | null
          created_at: string
          fail_reason: string | null
          id: string
          org_id: string
          pix_key: string
          pix_key_type: string
          status: string
          updated_at: string
          value: number
        }
        Insert: {
          asaas_transfer_id?: string | null
          created_at?: string
          fail_reason?: string | null
          id?: string
          org_id: string
          pix_key: string
          pix_key_type: string
          status?: string
          updated_at?: string
          value: number
        }
        Update: {
          asaas_transfer_id?: string | null
          created_at?: string
          fail_reason?: string | null
          id?: string
          org_id?: string
          pix_key?: string
          pix_key_type?: string
          status?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "asaas_subaccount_withdrawals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      asaas_subaccounts: {
        Row: {
          api_key: string
          asaas_account_id: string
          created_at: string
          id: string
          onboarding_url: string | null
          org_id: string
          pix_key: string | null
          pix_key_type: string | null
          status: string
          updated_at: string
          wallet_id: string
        }
        Insert: {
          api_key: string
          asaas_account_id: string
          created_at?: string
          id?: string
          onboarding_url?: string | null
          org_id: string
          pix_key?: string | null
          pix_key_type?: string | null
          status?: string
          updated_at?: string
          wallet_id: string
        }
        Update: {
          api_key?: string
          asaas_account_id?: string
          created_at?: string
          id?: string
          onboarding_url?: string | null
          org_id?: string
          pix_key?: string | null
          pix_key_type?: string | null
          status?: string
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asaas_subaccounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      atualizacao_form_campos: {
        Row: {
          config: Json | null
          form_id: string
          id: string
          label: string
          obrigatorio: boolean
          opcoes: Json | null
          ordem: number
          secao_id: string | null
          tipo: string
        }
        Insert: {
          config?: Json | null
          form_id: string
          id?: string
          label: string
          obrigatorio?: boolean
          opcoes?: Json | null
          ordem?: number
          secao_id?: string | null
          tipo: string
        }
        Update: {
          config?: Json | null
          form_id?: string
          id?: string
          label?: string
          obrigatorio?: boolean
          opcoes?: Json | null
          ordem?: number
          secao_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "atualizacao_form_campos_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "atualizacao_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atualizacao_form_campos_secao_id_fkey"
            columns: ["secao_id"]
            isOneToOne: false
            referencedRelation: "atualizacao_form_secoes"
            referencedColumns: ["id"]
          },
        ]
      }
      atualizacao_form_secoes: {
        Row: {
          form_id: string
          id: string
          instrucao: string | null
          ordem: number
          titulo: string
        }
        Insert: {
          form_id: string
          id?: string
          instrucao?: string | null
          ordem?: number
          titulo: string
        }
        Update: {
          form_id?: string
          id?: string
          instrucao?: string | null
          ordem?: number
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "atualizacao_form_secoes_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "atualizacao_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      atualizacao_forms: {
        Row: {
          ativo: boolean
          aviso_final: string | null
          created_at: string
          descricao: string | null
          id: string
          org_id: string
          titulo: string
        }
        Insert: {
          ativo?: boolean
          aviso_final?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          org_id: string
          titulo?: string
        }
        Update: {
          ativo?: boolean
          aviso_final?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          org_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "atualizacao_forms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      atualizacao_resposta_arquivos: {
        Row: {
          campo_id: string | null
          created_at: string
          id: string
          mime_type: string | null
          nome_original: string | null
          resposta_id: string
          storage_path: string
          tamanho: number | null
        }
        Insert: {
          campo_id?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          nome_original?: string | null
          resposta_id: string
          storage_path: string
          tamanho?: number | null
        }
        Update: {
          campo_id?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          nome_original?: string | null
          resposta_id?: string
          storage_path?: string
          tamanho?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "atualizacao_resposta_arquivos_campo_id_fkey"
            columns: ["campo_id"]
            isOneToOne: false
            referencedRelation: "atualizacao_form_campos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atualizacao_resposta_arquivos_resposta_id_fkey"
            columns: ["resposta_id"]
            isOneToOne: false
            referencedRelation: "atualizacao_respostas"
            referencedColumns: ["id"]
          },
        ]
      }
      atualizacao_resposta_valores: {
        Row: {
          campo_id: string | null
          id: string
          resposta_id: string
          valor_numero: number | null
          valor_opcoes: Json | null
          valor_texto: string | null
        }
        Insert: {
          campo_id?: string | null
          id?: string
          resposta_id: string
          valor_numero?: number | null
          valor_opcoes?: Json | null
          valor_texto?: string | null
        }
        Update: {
          campo_id?: string | null
          id?: string
          resposta_id?: string
          valor_numero?: number | null
          valor_opcoes?: Json | null
          valor_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atualizacao_resposta_valores_campo_id_fkey"
            columns: ["campo_id"]
            isOneToOne: false
            referencedRelation: "atualizacao_form_campos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atualizacao_resposta_valores_resposta_id_fkey"
            columns: ["resposta_id"]
            isOneToOne: false
            referencedRelation: "atualizacao_respostas"
            referencedColumns: ["id"]
          },
        ]
      }
      atualizacao_respostas: {
        Row: {
          concluida: boolean
          form_id: string
          id: string
          mensagem_feedback: string | null
          org_id: string
          relatorio_gerado_em: string | null
          relatorio_ia: string | null
          student_id: string
          submitted_at: string
        }
        Insert: {
          concluida?: boolean
          form_id: string
          id?: string
          mensagem_feedback?: string | null
          org_id: string
          relatorio_gerado_em?: string | null
          relatorio_ia?: string | null
          student_id: string
          submitted_at?: string
        }
        Update: {
          concluida?: boolean
          form_id?: string
          id?: string
          mensagem_feedback?: string | null
          org_id?: string
          relatorio_gerado_em?: string | null
          relatorio_ia?: string | null
          student_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atualizacao_respostas_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "atualizacao_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atualizacao_respostas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      avaliacao_fotos: {
        Row: {
          avaliacao_id: string
          created_at: string
          id: string
          observacoes: string | null
          photo_index: number
          storage_path: string
          test_key: string
        }
        Insert: {
          avaliacao_id: string
          created_at?: string
          id?: string
          observacoes?: string | null
          photo_index?: number
          storage_path: string
          test_key: string
        }
        Update: {
          avaliacao_id?: string
          created_at?: string
          id?: string
          observacoes?: string | null
          photo_index?: number
          storage_path?: string
          test_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "avaliacao_fotos_avaliacao_id_fkey"
            columns: ["avaliacao_id"]
            isOneToOne: false
            referencedRelation: "avaliacoes_posturais"
            referencedColumns: ["id"]
          },
        ]
      }
      avaliacao_postural_config: {
        Row: {
          created_at: string | null
          id: string
          introducao: string | null
          introducao_secoes: Json
          org_id: string
          testes: Json
        }
        Insert: {
          created_at?: string | null
          id?: string
          introducao?: string | null
          introducao_secoes?: Json
          org_id: string
          testes?: Json
        }
        Update: {
          created_at?: string | null
          id?: string
          introducao?: string | null
          introducao_secoes?: Json
          org_id?: string
          testes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "avaliacao_postural_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      avaliacoes_fisicas: {
        Row: {
          aluno_id: string
          created_at: string
          data_avaliacao: string
          dinamometria_dorsal: number | null
          dinamometria_escapular: number | null
          dinamometria_manual: number | null
          dinamometria_manual_dir: number | null
          dinamometria_manual_esq: number | null
          foto_url: string | null
          gordura_visceral: number | null
          id: string
          imc: number | null
          massa_gordura_kg: number | null
          massa_muscular_kg: number | null
          medida_biceps_dir: number | null
          medida_biceps_esq: number | null
          medida_cintura: number | null
          medida_coxa_dir: number | null
          medida_coxa_esq: number | null
          medida_panturrilha_dir: number | null
          medida_panturrilha_esq: number | null
          medida_peitoral: number | null
          medida_quadril: number | null
          medidas_extras: Json | null
          observacoes: string | null
          org_id: string
          percentual_gordura: number | null
          peso: number | null
          pontuacao_inbody: number | null
          taxa_metabolica_basal: number | null
        }
        Insert: {
          aluno_id: string
          created_at?: string
          data_avaliacao: string
          dinamometria_dorsal?: number | null
          dinamometria_escapular?: number | null
          dinamometria_manual?: number | null
          dinamometria_manual_dir?: number | null
          dinamometria_manual_esq?: number | null
          foto_url?: string | null
          gordura_visceral?: number | null
          id?: string
          imc?: number | null
          massa_gordura_kg?: number | null
          massa_muscular_kg?: number | null
          medida_biceps_dir?: number | null
          medida_biceps_esq?: number | null
          medida_cintura?: number | null
          medida_coxa_dir?: number | null
          medida_coxa_esq?: number | null
          medida_panturrilha_dir?: number | null
          medida_panturrilha_esq?: number | null
          medida_peitoral?: number | null
          medida_quadril?: number | null
          medidas_extras?: Json | null
          observacoes?: string | null
          org_id: string
          percentual_gordura?: number | null
          peso?: number | null
          pontuacao_inbody?: number | null
          taxa_metabolica_basal?: number | null
        }
        Update: {
          aluno_id?: string
          created_at?: string
          data_avaliacao?: string
          dinamometria_dorsal?: number | null
          dinamometria_escapular?: number | null
          dinamometria_manual?: number | null
          dinamometria_manual_dir?: number | null
          dinamometria_manual_esq?: number | null
          foto_url?: string | null
          gordura_visceral?: number | null
          id?: string
          imc?: number | null
          massa_gordura_kg?: number | null
          massa_muscular_kg?: number | null
          medida_biceps_dir?: number | null
          medida_biceps_esq?: number | null
          medida_cintura?: number | null
          medida_coxa_dir?: number | null
          medida_coxa_esq?: number | null
          medida_panturrilha_dir?: number | null
          medida_panturrilha_esq?: number | null
          medida_peitoral?: number | null
          medida_quadril?: number | null
          medidas_extras?: Json | null
          observacoes?: string | null
          org_id?: string
          percentual_gordura?: number | null
          peso?: number | null
          pontuacao_inbody?: number | null
          taxa_metabolica_basal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "avaliacoes_fisicas_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_fisicas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      avaliacoes_posturais: {
        Row: {
          aluno_id: string | null
          created_at: string
          id: string
          observacoes: string | null
          org_id: string | null
          status: string
          student_user_id: string
        }
        Insert: {
          aluno_id?: string | null
          created_at?: string
          id?: string
          observacoes?: string | null
          org_id?: string | null
          status?: string
          student_user_id: string
        }
        Update: {
          aluno_id?: string | null
          created_at?: string
          id?: string
          observacoes?: string | null
          org_id?: string | null
          status?: string
          student_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avaliacoes_posturais_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_posturais_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cardio_planos: {
        Row: {
          aluno_id: string
          bpm_alvo: string | null
          created_at: string | null
          duracao_minutos: number | null
          frequencia_semana: number | null
          id: string
          observacoes: string | null
          org_id: string | null
          tipo: string
        }
        Insert: {
          aluno_id: string
          bpm_alvo?: string | null
          created_at?: string | null
          duracao_minutos?: number | null
          frequencia_semana?: number | null
          id?: string
          observacoes?: string | null
          org_id?: string | null
          tipo: string
        }
        Update: {
          aluno_id?: string
          bpm_alvo?: string | null
          created_at?: string | null
          duracao_minutos?: number | null
          frequencia_semana?: number | null
          id?: string
          observacoes?: string | null
          org_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cardio_planos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cardio_planos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cardio_sessoes: {
        Row: {
          bpm_medio: number | null
          cardio_plano_id: string | null
          created_at: string | null
          data_sessao: string
          duracao_minutos: number
          esforco: string | null
          feedback: string | null
          id: string
          kcal_estimado: number | null
          metodo_calculo: string | null
          org_id: string | null
          student_id: string
          tipo: string
        }
        Insert: {
          bpm_medio?: number | null
          cardio_plano_id?: string | null
          created_at?: string | null
          data_sessao: string
          duracao_minutos: number
          esforco?: string | null
          feedback?: string | null
          id?: string
          kcal_estimado?: number | null
          metodo_calculo?: string | null
          org_id?: string | null
          student_id: string
          tipo: string
        }
        Update: {
          bpm_medio?: number | null
          cardio_plano_id?: string | null
          created_at?: string | null
          data_sessao?: string
          duracao_minutos?: number
          esforco?: string | null
          feedback?: string | null
          id?: string
          kcal_estimado?: number | null
          metodo_calculo?: string | null
          org_id?: string | null
          student_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cardio_sessoes_cardio_plano_id_fkey"
            columns: ["cardio_plano_id"]
            isOneToOne: false
            referencedRelation: "cardio_planos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cardio_sessoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      check_ins: {
        Row: {
          aderencia: number | null
          created_at: string | null
          dieta_avaliacao: number | null
          dieta_obs: string | null
          fotos: string[] | null
          id: string
          obs_geral: string | null
          org_id: string | null
          relatorio_gerado_em: string | null
          relatorio_ia: string | null
          relatorio_visualizado: boolean | null
          student_id: string
          treinador_id: string | null
          treino_avaliacao: number | null
          treino_obs: string | null
          weight: number | null
        }
        Insert: {
          aderencia?: number | null
          created_at?: string | null
          dieta_avaliacao?: number | null
          dieta_obs?: string | null
          fotos?: string[] | null
          id?: string
          obs_geral?: string | null
          org_id?: string | null
          relatorio_gerado_em?: string | null
          relatorio_ia?: string | null
          relatorio_visualizado?: boolean | null
          student_id: string
          treinador_id?: string | null
          treino_avaliacao?: number | null
          treino_obs?: string | null
          weight?: number | null
        }
        Update: {
          aderencia?: number | null
          created_at?: string | null
          dieta_avaliacao?: number | null
          dieta_obs?: string | null
          fotos?: string[] | null
          id?: string
          obs_geral?: string | null
          org_id?: string | null
          relatorio_gerado_em?: string | null
          relatorio_ia?: string | null
          relatorio_visualizado?: boolean | null
          student_id?: string
          treinador_id?: string | null
          treino_avaliacao?: number | null
          treino_obs?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cobrancas: {
        Row: {
          aluno_id: string
          aluno_notificado_7d: boolean
          aluno_notificado_vencida: boolean
          asaas_id: string | null
          created_at: string
          data_pagamento: string | null
          data_vencimento: string
          descricao: string
          forma_pagamento: string
          id: string
          invoice_url: string | null
          notificado_15d: boolean
          notificado_30d: boolean
          notificado_7d: boolean
          org_id: string
          pix_key: string | null
          status: string
          trainer_notificado_vencida: boolean
          treinador_id: string
          updated_at: string
          valor: number
        }
        Insert: {
          aluno_id: string
          aluno_notificado_7d?: boolean
          aluno_notificado_vencida?: boolean
          asaas_id?: string | null
          created_at?: string
          data_pagamento?: string | null
          data_vencimento: string
          descricao: string
          forma_pagamento?: string
          id?: string
          invoice_url?: string | null
          notificado_15d?: boolean
          notificado_30d?: boolean
          notificado_7d?: boolean
          org_id: string
          pix_key?: string | null
          status?: string
          trainer_notificado_vencida?: boolean
          treinador_id: string
          updated_at?: string
          valor: number
        }
        Update: {
          aluno_id?: string
          aluno_notificado_7d?: boolean
          aluno_notificado_vencida?: boolean
          asaas_id?: string | null
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string
          descricao?: string
          forma_pagamento?: string
          id?: string
          invoice_url?: string | null
          notificado_15d?: boolean
          notificado_30d?: boolean
          notificado_7d?: boolean
          org_id?: string
          pix_key?: string | null
          status?: string
          trainer_notificado_vencida?: boolean
          treinador_id?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "cobrancas_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborators: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          id: string
          invite_expires_at: string | null
          invite_token: string | null
          invited_by: string | null
          name: string
          org_id: string
          permissions: Json
          role: string
          status: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          invited_by?: string | null
          name: string
          org_id: string
          permissions?: Json
          role: string
          status?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          invited_by?: string | null
          name?: string
          org_id?: string
          permissions?: Json
          role?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collaborators_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_techniques: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_techniques_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_meal_foods: {
        Row: {
          alimento_id: string | null
          id: string
          lista_subst_grupo_id: string | null
          lista_subst_porcoes: number | null
          meal_id: string | null
          name: string
          order_index: number | null
          parent_food_id: string | null
          portion: string | null
          quantidade: number | null
          substitution_group_id: string | null
          unidade: string | null
        }
        Insert: {
          alimento_id?: string | null
          id?: string
          lista_subst_grupo_id?: string | null
          lista_subst_porcoes?: number | null
          meal_id?: string | null
          name: string
          order_index?: number | null
          parent_food_id?: string | null
          portion?: string | null
          quantidade?: number | null
          substitution_group_id?: string | null
          unidade?: string | null
        }
        Update: {
          alimento_id?: string | null
          id?: string
          lista_subst_grupo_id?: string | null
          lista_subst_porcoes?: number | null
          meal_id?: string | null
          name?: string
          order_index?: number | null
          parent_food_id?: string | null
          portion?: string | null
          quantidade?: number | null
          substitution_group_id?: string | null
          unidade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diet_meal_foods_alimento_id_fkey"
            columns: ["alimento_id"]
            isOneToOne: false
            referencedRelation: "alimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diet_meal_foods_lista_subst_grupo_id_fkey"
            columns: ["lista_subst_grupo_id"]
            isOneToOne: false
            referencedRelation: "lista_subst_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diet_meal_foods_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "diet_meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diet_meal_foods_parent_food_id_fkey"
            columns: ["parent_food_id"]
            isOneToOne: false
            referencedRelation: "diet_meal_foods"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_meals: {
        Row: {
          diet_id: string | null
          id: string
          modo_preparo: string | null
          name: string
          notes: string | null
          observacoes_receita: string | null
          order_index: number | null
          time_suggestion: string | null
        }
        Insert: {
          diet_id?: string | null
          id?: string
          modo_preparo?: string | null
          name: string
          notes?: string | null
          observacoes_receita?: string | null
          order_index?: number | null
          time_suggestion?: string | null
        }
        Update: {
          diet_id?: string | null
          id?: string
          modo_preparo?: string | null
          name?: string
          notes?: string | null
          observacoes_receita?: string | null
          order_index?: number | null
          time_suggestion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diet_meals_diet_id_fkey"
            columns: ["diet_id"]
            isOneToOne: false
            referencedRelation: "diets"
            referencedColumns: ["id"]
          },
        ]
      }
      dietas_pdf: {
        Row: {
          aluno_id: string
          atualizada_em: string
          created_at: string | null
          id: string
          nome_arquivo: string
          pdf_url: string
          vista_pelo_aluno_em: string | null
        }
        Insert: {
          aluno_id: string
          atualizada_em?: string
          created_at?: string | null
          id?: string
          nome_arquivo: string
          pdf_url: string
          vista_pelo_aluno_em?: string | null
        }
        Update: {
          aluno_id?: string
          atualizada_em?: string
          created_at?: string | null
          id?: string
          nome_arquivo?: string
          pdf_url?: string
          vista_pelo_aluno_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dietas_pdf_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: true
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
        ]
      }
      diets: {
        Row: {
          calories: number | null
          created_at: string | null
          dias_semana: string[] | null
          id: string
          info_adicional: string | null
          is_active: boolean | null
          meta_agua_ml: number | null
          observacoes: string | null
          org_id: string | null
          refeicao_livre: string | null
          student_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          calories?: number | null
          created_at?: string | null
          dias_semana?: string[] | null
          id?: string
          info_adicional?: string | null
          is_active?: boolean | null
          meta_agua_ml?: number | null
          observacoes?: string | null
          org_id?: string | null
          refeicao_livre?: string | null
          student_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          calories?: number | null
          created_at?: string | null
          dias_semana?: string[] | null
          id?: string
          info_adicional?: string | null
          is_active?: boolean | null
          meta_agua_ml?: number | null
          observacoes?: string | null
          org_id?: string | null
          refeicao_livre?: string | null
          student_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_photo_slots: {
        Row: {
          created_at: string
          id: string
          label: string
          ordem: number
          org_id: string
          slot_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          ordem?: number
          org_id: string
          slot_key: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          ordem?: number
          org_id?: string
          slot_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "evolution_photo_slots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_photos: {
        Row: {
          created_at: string
          id: string
          org_id: string
          slot: string
          storage_path: string
          student_id: string
          taken_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          slot: string
          storage_path: string
          student_id: string
          taken_at: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          slot?: string
          storage_path?: string
          student_id?: string
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evolution_photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      exercicios: {
        Row: {
          carga_base: string | null
          conjugado_com_proximo: boolean
          created_at: string | null
          descanso: string | null
          exercicio_base_id: string | null
          id: string
          nome_exercicio: string
          observacoes: string | null
          ordem: number | null
          org_id: string | null
          repeticoes: string
          series: string
          series_detalhadas: Json | null
          treino_id: string
          video_url: string | null
        }
        Insert: {
          carga_base?: string | null
          conjugado_com_proximo?: boolean
          created_at?: string | null
          descanso?: string | null
          exercicio_base_id?: string | null
          id?: string
          nome_exercicio: string
          observacoes?: string | null
          ordem?: number | null
          org_id?: string | null
          repeticoes: string
          series: string
          series_detalhadas?: Json | null
          treino_id: string
          video_url?: string | null
        }
        Update: {
          carga_base?: string | null
          conjugado_com_proximo?: boolean
          created_at?: string | null
          descanso?: string | null
          exercicio_base_id?: string | null
          id?: string
          nome_exercicio?: string
          observacoes?: string | null
          ordem?: number | null
          org_id?: string | null
          repeticoes?: string
          series?: string
          series_detalhadas?: Json | null
          treino_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercicios_exercicio_base_id_fkey"
            columns: ["exercicio_base_id"]
            isOneToOne: false
            referencedRelation: "exercicios_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercicios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercicios_treino_id_fkey"
            columns: ["treino_id"]
            isOneToOne: false
            referencedRelation: "treinos"
            referencedColumns: ["id"]
          },
        ]
      }
      exercicios_base: {
        Row: {
          ativo: boolean | null
          categoria: string | null
          created_at: string | null
          descricao: string | null
          forked_from_id: string | null
          grupo_muscular_principal: string | null
          grupo_muscular_secundario: string | null
          id: string
          liberado_outras_orgs: boolean
          musculos_principais: string | null
          nome: string
          org_id: string | null
          treinador_id: string
          video_url: string | null
        }
        Insert: {
          ativo?: boolean | null
          categoria?: string | null
          created_at?: string | null
          descricao?: string | null
          forked_from_id?: string | null
          grupo_muscular_principal?: string | null
          grupo_muscular_secundario?: string | null
          id?: string
          liberado_outras_orgs?: boolean
          musculos_principais?: string | null
          nome: string
          org_id?: string | null
          treinador_id: string
          video_url?: string | null
        }
        Update: {
          ativo?: boolean | null
          categoria?: string | null
          created_at?: string | null
          descricao?: string | null
          forked_from_id?: string | null
          grupo_muscular_principal?: string | null
          grupo_muscular_secundario?: string | null
          id?: string
          liberado_outras_orgs?: boolean
          musculos_principais?: string | null
          nome?: string
          org_id?: string | null
          treinador_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercicios_base_forked_from_id_fkey"
            columns: ["forked_from_id"]
            isOneToOne: false
            referencedRelation: "exercicios_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercicios_base_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercicios_base_treinador_id_fkey"
            columns: ["treinador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exercicios_carga: {
        Row: {
          aluno_id: string
          carga: string
          created_at: string
          data_registro: string
          exercicio_id: string
          id: string
          updated_at: string
        }
        Insert: {
          aluno_id: string
          carga: string
          created_at?: string
          data_registro?: string
          exercicio_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          aluno_id?: string
          carga?: string
          created_at?: string
          data_registro?: string
          exercicio_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercicios_carga_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercicios_carga_exercicio_id_fkey"
            columns: ["exercicio_id"]
            isOneToOne: false
            referencedRelation: "exercicios"
            referencedColumns: ["id"]
          },
        ]
      }
      feedbacks_alunos: {
        Row: {
          aluno_id: string
          created_at: string
          id: string
          mensagem: string
          titulo: string | null
          treinador_id: string
          visto_pelo_aluno: boolean
        }
        Insert: {
          aluno_id: string
          created_at?: string
          id?: string
          mensagem: string
          titulo?: string | null
          treinador_id: string
          visto_pelo_aluno?: boolean
        }
        Update: {
          aluno_id?: string
          created_at?: string
          id?: string
          mensagem?: string
          titulo?: string | null
          treinador_id?: string
          visto_pelo_aluno?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "feedbacks_alunos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_carga: {
        Row: {
          aluno_id: string
          carga: string
          created_at: string
          data_registro: string
          exercicio_id: string | null
          id: string
        }
        Insert: {
          aluno_id: string
          carga: string
          created_at?: string
          data_registro?: string
          exercicio_id?: string | null
          id?: string
        }
        Update: {
          aluno_id?: string
          carga?: string
          created_at?: string
          data_registro?: string
          exercicio_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historico_carga_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_carga_exercicio_id_fkey"
            columns: ["exercicio_id"]
            isOneToOne: false
            referencedRelation: "exercicios"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_calls: {
        Row: {
          created_at: string
          data_hora: string
          id: string
          lead_id: string
          msg_confirmacao: string | null
          msg_lembrete: string | null
          notificado_2h: boolean
          observacoes: string | null
          org_id: string
          status: string
          treinador_id: string
          whatsapp_sent: boolean
        }
        Insert: {
          created_at?: string
          data_hora: string
          id?: string
          lead_id: string
          msg_confirmacao?: string | null
          msg_lembrete?: string | null
          notificado_2h?: boolean
          observacoes?: string | null
          org_id: string
          status?: string
          treinador_id: string
          whatsapp_sent?: boolean
        }
        Update: {
          created_at?: string
          data_hora?: string
          id?: string
          lead_id?: string
          msg_confirmacao?: string | null
          msg_lembrete?: string | null
          notificado_2h?: boolean
          observacoes?: string | null
          org_id?: string
          status?: string
          treinador_id?: string
          whatsapp_sent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "lead_calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_interactions: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          nota: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          nota: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          nota?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_interactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          aluno_id: string | null
          created_at: string
          follow_up_at: string | null
          follow_up_note: string | null
          id: string
          instagram: string | null
          nome: string
          objetivo: string | null
          org_id: string
          origem: string
          status: string
          treinador_id: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          aluno_id?: string | null
          created_at?: string
          follow_up_at?: string | null
          follow_up_note?: string | null
          id?: string
          instagram?: string | null
          nome: string
          objetivo?: string | null
          org_id: string
          origem?: string
          status?: string
          treinador_id: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          aluno_id?: string | null
          created_at?: string
          follow_up_at?: string | null
          follow_up_note?: string | null
          id?: string
          instagram?: string | null
          nome?: string
          objetivo?: string | null
          org_id?: string
          origem?: string
          status?: string
          treinador_id?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_subst_grupos: {
        Row: {
          created_at: string | null
          id: string
          nome: string
          numero: number
          org_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          nome: string
          numero: number
          org_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string
          numero?: number
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lista_subst_grupos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_subst_itens: {
        Row: {
          created_at: string | null
          grupo_id: string
          id: string
          nome: string
          ordem: number
          porcao: string | null
        }
        Insert: {
          created_at?: string | null
          grupo_id: string
          id?: string
          nome: string
          ordem?: number
          porcao?: string | null
        }
        Update: {
          created_at?: string | null
          grupo_id?: string
          id?: string
          nome?: string
          ordem?: number
          porcao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lista_subst_itens_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "lista_subst_grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_alternative_foods: {
        Row: {
          alimento_id: string | null
          alternative_id: string
          created_at: string | null
          id: string
          nome_display: string
          ordem: number
          quantidade: number
          unidade: string
        }
        Insert: {
          alimento_id?: string | null
          alternative_id: string
          created_at?: string | null
          id?: string
          nome_display?: string
          ordem?: number
          quantidade?: number
          unidade?: string
        }
        Update: {
          alimento_id?: string | null
          alternative_id?: string
          created_at?: string | null
          id?: string
          nome_display?: string
          ordem?: number
          quantidade?: number
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_alternative_foods_alimento_id_fkey"
            columns: ["alimento_id"]
            isOneToOne: false
            referencedRelation: "alimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_alternative_foods_alternative_id_fkey"
            columns: ["alternative_id"]
            isOneToOne: false
            referencedRelation: "meal_alternatives"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_alternative_selections: {
        Row: {
          alternative_id: string | null
          created_at: string | null
          date: string
          id: string
          meal_id: string
          student_id: string
        }
        Insert: {
          alternative_id?: string | null
          created_at?: string | null
          date?: string
          id?: string
          meal_id: string
          student_id: string
        }
        Update: {
          alternative_id?: string | null
          created_at?: string | null
          date?: string
          id?: string
          meal_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_alternative_selections_alternative_id_fkey"
            columns: ["alternative_id"]
            isOneToOne: false
            referencedRelation: "meal_alternatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_alternative_selections_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "diet_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_alternatives: {
        Row: {
          created_at: string | null
          id: string
          meal_id: string
          nome: string
          ordem: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          meal_id: string
          nome?: string
          ordem?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          meal_id?: string
          nome?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_alternatives_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "diet_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_completions: {
        Row: {
          created_at: string | null
          date: string
          id: string
          meal_id: string
          student_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          meal_id: string
          student_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          meal_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_completions_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "diet_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens: {
        Row: {
          conteudo: string
          created_at: string | null
          destinatario_id: string
          id: string
          lida: boolean | null
          org_id: string | null
          remetente_id: string
        }
        Insert: {
          conteudo: string
          created_at?: string | null
          destinatario_id: string
          id?: string
          lida?: boolean | null
          org_id?: string | null
          remetente_id: string
        }
        Update: {
          conteudo?: string
          created_at?: string | null
          destinatario_id?: string
          id?: string
          lida?: boolean | null
          org_id?: string | null
          remetente_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos_exercicios: {
        Row: {
          created_at: string | null
          descanso: string | null
          exercicio_base_id: string | null
          id: string
          modelo_treino_dia_id: string
          nome_exercicio: string
          observacoes: string | null
          ordem: number | null
          repeticoes: string
          series: string
          video_url: string | null
        }
        Insert: {
          created_at?: string | null
          descanso?: string | null
          exercicio_base_id?: string | null
          id?: string
          modelo_treino_dia_id: string
          nome_exercicio: string
          observacoes?: string | null
          ordem?: number | null
          repeticoes: string
          series: string
          video_url?: string | null
        }
        Update: {
          created_at?: string | null
          descanso?: string | null
          exercicio_base_id?: string | null
          id?: string
          modelo_treino_dia_id?: string
          nome_exercicio?: string
          observacoes?: string | null
          ordem?: number | null
          repeticoes?: string
          series?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "modelos_exercicios_exercicio_base_id_fkey"
            columns: ["exercicio_base_id"]
            isOneToOne: false
            referencedRelation: "exercicios_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modelos_exercicios_modelo_treino_dia_id_fkey"
            columns: ["modelo_treino_dia_id"]
            isOneToOne: false
            referencedRelation: "modelos_treinos_dia"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos_semanas: {
        Row: {
          created_at: string | null
          id: string
          modelo_id: string
          observacoes: string | null
          semana_fim: number
          semana_inicio: number
          zona_reps: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          modelo_id: string
          observacoes?: string | null
          semana_fim: number
          semana_inicio: number
          zona_reps?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          modelo_id?: string
          observacoes?: string | null
          semana_fim?: number
          semana_inicio?: number
          zona_reps?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "modelos_semanas_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "modelos_treino"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos_treino: {
        Row: {
          created_at: string | null
          descricao: string | null
          id: string
          nome_modelo: string
          objetivo: string | null
          org_id: string | null
          treinador_id: string
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome_modelo: string
          objetivo?: string | null
          org_id?: string | null
          treinador_id: string
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome_modelo?: string
          objetivo?: string | null
          org_id?: string | null
          treinador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "modelos_treino_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modelos_treino_treinador_id_fkey"
            columns: ["treinador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos_treinos_dia: {
        Row: {
          created_at: string | null
          descricao_geral: string | null
          dia_semana: string
          id: string
          modelo_semana_id: string
          ordem: number | null
          titulo_treino: string
        }
        Insert: {
          created_at?: string | null
          descricao_geral?: string | null
          dia_semana: string
          id?: string
          modelo_semana_id: string
          ordem?: number | null
          titulo_treino: string
        }
        Update: {
          created_at?: string | null
          descricao_geral?: string | null
          dia_semana?: string
          id?: string
          modelo_semana_id?: string
          ordem?: number | null
          titulo_treino?: string
        }
        Relationships: [
          {
            foreignKeyName: "modelos_treinos_dia_modelo_semana_id_fkey"
            columns: ["modelo_semana_id"]
            isOneToOne: false
            referencedRelation: "modelos_semanas"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          aluno_id: string | null
          aluno_nome: string | null
          created_at: string | null
          id: string
          lida: boolean | null
          link: string | null
          mensagem: string | null
          org_id: string | null
          tipo: string | null
          titulo: string
          user_id: string | null
        }
        Insert: {
          aluno_id?: string | null
          aluno_nome?: string | null
          created_at?: string | null
          id?: string
          lida?: boolean | null
          link?: string | null
          mensagem?: string | null
          org_id?: string | null
          tipo?: string | null
          titulo: string
          user_id?: string | null
        }
        Update: {
          aluno_id?: string | null
          aluno_nome?: string | null
          created_at?: string | null
          id?: string
          lida?: boolean | null
          link?: string | null
          mensagem?: string | null
          org_id?: string | null
          tipo?: string | null
          titulo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          body: string
          created_at: string
          delivered: boolean
          id: string
          notification_type: string
          org_id: string | null
          recipient_id: string
          tag: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          delivered?: boolean
          id?: string
          notification_type: string
          org_id?: string | null
          recipient_id: string
          tag?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          delivered?: boolean
          id?: string
          notification_type?: string
          org_id?: string | null
          recipient_id?: string
          tag?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          active: boolean
          agendamento_tipos: Json
          alunos_tier: string
          created_at: string
          custom_price: number | null
          custom_trial_days: number | null
          has_avaliacao_postural: boolean
          icon_url: string | null
          id: string
          is_gs_brand: boolean
          login_logo_url: string | null
          logo_dark_url: string | null
          logo_url: string | null
          meta_faturamento: number
          name: string
          nome_marca: string | null
          onboarding_completed: boolean
          owner_id: string
          plan: string
          plan_type: string
          primary_color: string
          referred_by: string | null
          serie_config: Json | null
          slug: string
          subdominio: string | null
          subscription_status: string | null
          theme: string
          trial_ends_at: string | null
          updated_at: string
          whatsapp_connected_at: string | null
          whatsapp_instance_name: string | null
          whatsapp_last_disconnected_at: string | null
          whatsapp_status: string
        }
        Insert: {
          active?: boolean
          agendamento_tipos?: Json
          alunos_tier?: string
          created_at?: string
          custom_price?: number | null
          custom_trial_days?: number | null
          has_avaliacao_postural?: boolean
          icon_url?: string | null
          id?: string
          is_gs_brand?: boolean
          login_logo_url?: string | null
          logo_dark_url?: string | null
          logo_url?: string | null
          meta_faturamento?: number
          name: string
          nome_marca?: string | null
          onboarding_completed?: boolean
          owner_id: string
          plan?: string
          plan_type?: string
          primary_color?: string
          referred_by?: string | null
          serie_config?: Json | null
          slug: string
          subdominio?: string | null
          subscription_status?: string | null
          theme?: string
          trial_ends_at?: string | null
          updated_at?: string
          whatsapp_connected_at?: string | null
          whatsapp_instance_name?: string | null
          whatsapp_last_disconnected_at?: string | null
          whatsapp_status?: string
        }
        Update: {
          active?: boolean
          agendamento_tipos?: Json
          alunos_tier?: string
          created_at?: string
          custom_price?: number | null
          custom_trial_days?: number | null
          has_avaliacao_postural?: boolean
          icon_url?: string | null
          id?: string
          is_gs_brand?: boolean
          login_logo_url?: string | null
          logo_dark_url?: string | null
          logo_url?: string | null
          meta_faturamento?: number
          name?: string
          nome_marca?: string | null
          onboarding_completed?: boolean
          owner_id?: string
          plan?: string
          plan_type?: string
          primary_color?: string
          referred_by?: string | null
          serie_config?: Json | null
          slug?: string
          subdominio?: string | null
          subscription_status?: string | null
          theme?: string
          trial_ends_at?: string | null
          updated_at?: string
          whatsapp_connected_at?: string | null
          whatsapp_instance_name?: string | null
          whatsapp_last_disconnected_at?: string | null
          whatsapp_status?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          amount: number | null
          asaas_payment_id: string | null
          created_at: string | null
          due_date: string | null
          event_type: string
          id: string
          organization_id: string | null
          paid_at: string | null
          raw_payload: Json | null
          subscription_id: string | null
        }
        Insert: {
          amount?: number | null
          asaas_payment_id?: string | null
          created_at?: string | null
          due_date?: string | null
          event_type: string
          id?: string
          organization_id?: string | null
          paid_at?: string | null
          raw_payload?: Json | null
          subscription_id?: string | null
        }
        Update: {
          amount?: number | null
          asaas_payment_id?: string | null
          created_at?: string | null
          due_date?: string | null
          event_type?: string
          id?: string
          organization_id?: string | null
          paid_at?: string | null
          raw_payload?: Json | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      planos_produto: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          descricao: string | null
          duracao_dias: number | null
          id: string
          modalidade: string | null
          nome: string
          org_id: string
          preco: number | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          duracao_dias?: number | null
          id?: string
          modalidade?: string | null
          nome: string
          org_id: string
          preco?: number | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          duracao_dias?: number | null
          id?: string
          modalidade?: string | null
          nome?: string
          org_id?: string
          preco?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "planos_produto_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      planos_treino: {
        Row: {
          aluno_id: string
          ativo: boolean | null
          atualizado_em: string
          created_at: string | null
          data_fim: string | null
          data_inicio: string
          id: string
          nome_plano: string
          objetivo: string | null
          observacoes: string | null
          visto_pelo_aluno_em: string | null
        }
        Insert: {
          aluno_id: string
          ativo?: boolean | null
          atualizado_em?: string
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string
          id?: string
          nome_plano: string
          objetivo?: string | null
          observacoes?: string | null
          visto_pelo_aluno_em?: string | null
        }
        Update: {
          aluno_id?: string
          ativo?: boolean | null
          atualizado_em?: string
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string
          id?: string
          nome_plano?: string
          objetivo?: string | null
          observacoes?: string | null
          visto_pelo_aluno_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planos_treino_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          created_at: string
          id: string
          installment_options: Json
          name: string
          org_id: string
          pix_value: number | null
          trainer_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          installment_options?: Json
          name: string
          org_id: string
          pix_value?: number | null
          trainer_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          installment_options?: Json
          name?: string
          org_id?: string
          pix_value?: number | null
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          id: string
          nome: string
          tipo_usuario: Database["public"]["Enums"]["user_type"]
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          id: string
          nome: string
          tipo_usuario: Database["public"]["Enums"]["user_type"]
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          tipo_usuario?: Database["public"]["Enums"]["user_type"]
          whatsapp?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string | null
          created_at: string | null
          endpoint: string
          id: string
          org_id: string | null
          p256dh: string | null
          platform: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key?: string | null
          created_at?: string | null
          endpoint: string
          id?: string
          org_id?: string | null
          p256dh?: string | null
          platform?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string | null
          created_at?: string | null
          endpoint?: string
          id?: string
          org_id?: string | null
          p256dh?: string | null
          platform?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_agua: {
        Row: {
          created_at: string | null
          data_registro: string
          id: string
          ml_total: number
          org_id: string | null
          student_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          data_registro: string
          id?: string
          ml_total?: number
          org_id?: string | null
          student_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          data_registro?: string
          id?: string
          ml_total?: number
          org_id?: string | null
          student_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registros_agua_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_evolucao: {
        Row: {
          created_at: string | null
          data_registro: string
          id: string
          org_id: string | null
          peso_kg: number | null
          student_id: string
        }
        Insert: {
          created_at?: string | null
          data_registro: string
          id?: string
          org_id?: string | null
          peso_kg?: number | null
          student_id: string
        }
        Update: {
          created_at?: string | null
          data_registro?: string
          id?: string
          org_id?: string | null
          peso_kg?: number | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registros_evolucao_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      semanas: {
        Row: {
          created_at: string | null
          data_fim: string | null
          data_inicio: string | null
          id: string
          numero_semana: number
          observacoes: string | null
          org_id: string | null
          plano_id: string
          semana_fim: number | null
          semana_inicio: number | null
          zona_reps: string | null
        }
        Insert: {
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          numero_semana: number
          observacoes?: string | null
          org_id?: string | null
          plano_id: string
          semana_fim?: number | null
          semana_inicio?: number | null
          zona_reps?: string | null
        }
        Update: {
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          numero_semana?: number
          observacoes?: string | null
          org_id?: string | null
          plano_id?: string
          semana_fim?: number | null
          semana_inicio?: number | null
          zona_reps?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "semanas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semanas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos_treino"
            referencedColumns: ["id"]
          },
        ]
      }
      serie_completions: {
        Row: {
          carga_realizada: string | null
          created_at: string | null
          date: string
          exercicio_id: string
          id: string
          reps_realizadas: string | null
          serie_key: string
          slot_index: number
          student_id: string
        }
        Insert: {
          carga_realizada?: string | null
          created_at?: string | null
          date: string
          exercicio_id: string
          id?: string
          reps_realizadas?: string | null
          serie_key: string
          slot_index?: number
          student_id: string
        }
        Update: {
          carga_realizada?: string | null
          created_at?: string | null
          date?: string
          exercicio_id?: string
          id?: string
          reps_realizadas?: string | null
          serie_key?: string
          slot_index?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "serie_completions_exercicio_id_fkey"
            columns: ["exercicio_id"]
            isOneToOne: false
            referencedRelation: "exercicios"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          created_at: string | null
          full_price: number | null
          grace_until: string | null
          id: string
          intro_step: boolean
          next_billing_date: string | null
          organization_id: string
          plan: string
          plan_type: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          created_at?: string | null
          full_price?: number | null
          grace_until?: string | null
          id?: string
          intro_step?: boolean
          next_billing_date?: string | null
          organization_id: string
          plan: string
          plan_type?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          created_at?: string | null
          full_price?: number | null
          grace_until?: string | null
          id?: string
          intro_step?: boolean
          next_billing_date?: string | null
          organization_id?: string
          plan?: string
          plan_type?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suplementos: {
        Row: {
          aluno_id: string
          created_at: string | null
          dosagem: string | null
          id: string
          instrucao: string | null
          nome: string
          ordem: number | null
          org_id: string | null
        }
        Insert: {
          aluno_id: string
          created_at?: string | null
          dosagem?: string | null
          id?: string
          instrucao?: string | null
          nome: string
          ordem?: number | null
          org_id?: string | null
        }
        Update: {
          aluno_id?: string
          created_at?: string | null
          dosagem?: string | null
          id?: string
          instrucao?: string | null
          nome?: string
          ordem?: number | null
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suplementos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suplementos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      treino_sessoes_log: {
        Row: {
          aluno_id: string
          created_at: string
          data_conclusao: string
          id: string
          org_id: string | null
          plano_id: string | null
          treino_id: string | null
        }
        Insert: {
          aluno_id: string
          created_at?: string
          data_conclusao?: string
          id?: string
          org_id?: string | null
          plano_id?: string | null
          treino_id?: string | null
        }
        Update: {
          aluno_id?: string
          created_at?: string
          data_conclusao?: string
          id?: string
          org_id?: string | null
          plano_id?: string | null
          treino_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treino_sessoes_log_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treino_sessoes_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treino_sessoes_log_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos_treino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treino_sessoes_log_treino_id_fkey"
            columns: ["treino_id"]
            isOneToOne: false
            referencedRelation: "treinos"
            referencedColumns: ["id"]
          },
        ]
      }
      treinos: {
        Row: {
          created_at: string | null
          descricao_geral: string | null
          dia_semana: string
          id: string
          ordem: number | null
          org_id: string | null
          semana_id: string
          titulo_treino: string
        }
        Insert: {
          created_at?: string | null
          descricao_geral?: string | null
          dia_semana: string
          id?: string
          ordem?: number | null
          org_id?: string | null
          semana_id: string
          titulo_treino: string
        }
        Update: {
          created_at?: string | null
          descricao_geral?: string | null
          dia_semana?: string
          id?: string
          ordem?: number | null
          org_id?: string | null
          semana_id?: string
          titulo_treino?: string
        }
        Relationships: [
          {
            foreignKeyName: "treinos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treinos_semana_id_fkey"
            columns: ["semana_id"]
            isOneToOne: false
            referencedRelation: "semanas"
            referencedColumns: ["id"]
          },
        ]
      }
      treinos_concluidos: {
        Row: {
          aluno_id: string
          comentario: string | null
          data_conclusao: string | null
          id: string
          treino_id: string
        }
        Insert: {
          aluno_id: string
          comentario?: string | null
          data_conclusao?: string | null
          id?: string
          treino_id: string
        }
        Update: {
          aluno_id?: string
          comentario?: string | null
          data_conclusao?: string | null
          id?: string
          treino_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treinos_concluidos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treinos_concluidos_treino_id_fkey"
            columns: ["treino_id"]
            isOneToOne: false
            referencedRelation: "treinos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_connection_events: {
        Row: {
          event_type: string
          id: string
          org_id: string
          raw_payload: Json | null
          received_at: string
          status: string | null
        }
        Insert: {
          event_type: string
          id?: string
          org_id: string
          raw_payload?: Json | null
          received_at?: string
          status?: string | null
        }
        Update: {
          event_type?: string
          id?: string
          org_id?: string
          raw_payload?: Json | null
          received_at?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connection_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_message_queue: {
        Row: {
          aluno_id: string
          created_at: string
          error: string | null
          id: string
          message_type: string
          org_id: string
          payload: Json
          scheduled_for: string
          sent_at: string | null
          status: string
          telefone: string
        }
        Insert: {
          aluno_id: string
          created_at?: string
          error?: string | null
          id?: string
          message_type: string
          org_id: string
          payload?: Json
          scheduled_for: string
          sent_at?: string | null
          status?: string
          telefone: string
        }
        Update: {
          aluno_id?: string
          created_at?: string
          error?: string | null
          id?: string
          message_type?: string
          org_id?: string
          payload?: Json
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          telefone?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_queue_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          aluno_id: string | null
          content: string
          created_at: string
          direction: string
          id: string
          lead_id: string | null
          org_id: string
          status: string
          wa_message_id: string | null
        }
        Insert: {
          aluno_id?: string | null
          content: string
          created_at?: string
          direction: string
          id?: string
          lead_id?: string | null
          org_id: string
          status?: string
          wa_message_id?: string | null
        }
        Update: {
          aluno_id?: string | null
          content?: string
          created_at?: string
          direction?: string
          id?: string
          lead_id?: string | null
          org_id?: string
          status?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          created_at: string
          id: string
          org_id: string
          template: string
          tipo: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          template: string
          tipo: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          template?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_events: {
        Row: {
          created_at: string
          id: string
          note: string | null
          org_id: string
          ref_date: string
          source: string
          student_id: string
          xp: number
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          org_id: string
          ref_date: string
          source: string
          student_id: string
          xp?: number
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          org_id?: string
          ref_date?: string
          source?: string
          student_id?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "xp_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_totals: {
        Row: {
          org_id: string
          student_id: string
          total_xp: number
          updated_at: string
        }
        Insert: {
          org_id: string
          student_id: string
          total_xp?: number
          updated_at?: string
        }
        Update: {
          org_id?: string
          student_id?: string
          total_xp?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_totals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_totals_synthetic: {
        Row: {
          created_at: string
          id: string
          org_id: string
          total_xp: number
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          total_xp: number
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          total_xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "xp_totals_synthetic_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      alertar_cobrancas_vencendo: { Args: never; Returns: undefined }
      alternative_meal_id: { Args: { p_alt_id: string }; Returns: string }
      configurar_series_exercicios: { Args: { p_rows: Json }; Returns: number }
      fork_exercicio_base: {
        Args: { p_org_id: string; p_original_id: string; p_updates: Json }
        Returns: string
      }
      get_exercicios_by_org: {
        Args: { p_org_id: string }
        Returns: {
          categoria: string
          id: string
          musculos_principais: string
          nome: string
          video_url: string
        }[]
      }
      get_my_leaderboard_rank: { Args: { p_org_id: string }; Returns: number }
      get_my_org_id: { Args: never; Returns: string }
      get_org_active_student_count: {
        Args: { p_org_id: string }
        Returns: number
      }
      get_org_leaderboard_profiles: {
        Args: { p_org_id: string; p_student_ids: string[] }
        Returns: {
          avatar_url: string
          id: string
          nome: string
        }[]
      }
      get_tenant_by_email: { Args: { p_email: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_aluno: { Args: { _user_id: string }; Returns: boolean }
      is_collab_of_aluno_id: { Args: { p_aluno_id: string }; Returns: boolean }
      is_collab_of_org: { Args: { p_org_id: string }; Returns: boolean }
      is_collab_of_plano: { Args: { p_plano_id: string }; Returns: boolean }
      is_collab_of_student_uid: {
        Args: { p_student_user_id: string }
        Returns: boolean
      }
      is_diet_student: { Args: { p_diet_id: string }; Returns: boolean }
      is_diet_trainer: { Args: { p_diet_id: string }; Returns: boolean }
      is_my_student: { Args: { _student_user_id: string }; Returns: boolean }
      is_org_collaborator: { Args: { p_org_id: string }; Returns: boolean }
      is_org_member: { Args: { _org_id: string }; Returns: boolean }
      is_org_owner: { Args: { _org_id: string }; Returns: boolean }
      is_org_staff: { Args: { _org_id: string }; Returns: boolean }
      is_treinador: { Args: { _user_id: string }; Returns: boolean }
      listar_storage_orfaos: {
        Args: { p_bucket: string; p_table: string }
        Returns: {
          name: string
        }[]
      }
      match_alimento: {
        Args: { min_score?: number; termo: string }
        Returns: {
          carb_g: number
          fibra_g: number
          gordura_g: number
          id: string
          kcal: number
          nome: string
          porcao_descricao: string
          porcao_gramas: number
          proteina_g: number
          score: number
          sodio_mg: number
        }[]
      }
      match_exercicio: {
        Args: { min_score?: number; p_org_id: string; termo: string }
        Returns: {
          grupo_muscular_principal: string
          id: string
          nome: string
          score: number
          video_url: string
        }[]
      }
      meal_diet_id: { Args: { p_meal_id: string }; Returns: string }
      meal_student_id: { Args: { p_meal_id: string }; Returns: string }
      notificar_calls_proximas: { Args: never; Returns: undefined }
      reordenar_exercicios: { Args: { p_rows: Json }; Returns: number }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      slugify: { Args: { _text: string }; Returns: string }
      update_own_idade_sexo: {
        Args: { p_idade: number; p_sexo: string }
        Returns: undefined
      }
      verificar_atualizacoes_treinador: { Args: never; Returns: undefined }
      verificar_inatividade_alunos: { Args: never; Returns: undefined }
      verificar_lembretes_checkin: { Args: never; Returns: undefined }
      verificar_vencimento_planos: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "treinador" | "aluno"
      user_type: "treinador" | "aluno"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["treinador", "aluno"],
      user_type: ["treinador", "aluno"],
    },
  },
} as const
