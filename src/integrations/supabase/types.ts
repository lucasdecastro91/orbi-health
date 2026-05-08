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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      alunos: {
        Row: {
          ativo: boolean
          created_at: string | null
          form_atualizacao_ultima_data: string | null
          form_atualizacao_url: string | null
          id: string
          observacoes: string | null
          treinador_id: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string | null
          form_atualizacao_ultima_data?: string | null
          form_atualizacao_url?: string | null
          id?: string
          observacoes?: string | null
          treinador_id: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string | null
          form_atualizacao_ultima_data?: string | null
          form_atualizacao_url?: string | null
          id?: string
          observacoes?: string | null
          treinador_id?: string
          user_id?: string
        }
        Relationships: [
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
      exercicios: {
        Row: {
          created_at: string | null
          descanso: string | null
          exercicio_base_id: string | null
          id: string
          nome_exercicio: string
          observacoes: string | null
          ordem: number | null
          repeticoes: string
          series: string
          treino_id: string
          video_url: string | null
        }
        Insert: {
          created_at?: string | null
          descanso?: string | null
          exercicio_base_id?: string | null
          id?: string
          nome_exercicio: string
          observacoes?: string | null
          ordem?: number | null
          repeticoes: string
          series: string
          treino_id: string
          video_url?: string | null
        }
        Update: {
          created_at?: string | null
          descanso?: string | null
          exercicio_base_id?: string | null
          id?: string
          nome_exercicio?: string
          observacoes?: string | null
          ordem?: number | null
          repeticoes?: string
          series?: string
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
          id: string
          musculos_principais: string | null
          nome: string
          treinador_id: string
          video_url: string | null
        }
        Insert: {
          ativo?: boolean | null
          categoria?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          musculos_principais?: string | null
          nome: string
          treinador_id: string
          video_url?: string | null
        }
        Update: {
          ativo?: boolean | null
          categoria?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          musculos_principais?: string | null
          nome?: string
          treinador_id?: string
          video_url?: string | null
        }
        Relationships: [
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
          treinador_id: string
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome_modelo: string
          objetivo?: string | null
          treinador_id: string
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome_modelo?: string
          objetivo?: string | null
          treinador_id?: string
        }
        Relationships: [
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          id: string
          nome: string
          tipo_usuario: Database["public"]["Enums"]["user_type"]
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          id: string
          nome: string
          tipo_usuario: Database["public"]["Enums"]["user_type"]
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          tipo_usuario?: Database["public"]["Enums"]["user_type"]
        }
        Relationships: []
      }
      semanas: {
        Row: {
          created_at: string | null
          id: string
          numero_semana: number
          observacoes: string | null
          plano_id: string
          semana_fim: number | null
          semana_inicio: number | null
          zona_reps: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          numero_semana: number
          observacoes?: string | null
          plano_id: string
          semana_fim?: number | null
          semana_inicio?: number | null
          zona_reps?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          numero_semana?: number
          observacoes?: string | null
          plano_id?: string
          semana_fim?: number | null
          semana_inicio?: number | null
          zona_reps?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "semanas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos_treino"
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
          semana_id: string
          titulo_treino: string
        }
        Insert: {
          created_at?: string | null
          descricao_geral?: string | null
          dia_semana: string
          id?: string
          ordem?: number | null
          semana_id: string
          titulo_treino: string
        }
        Update: {
          created_at?: string | null
          descricao_geral?: string | null
          dia_semana?: string
          id?: string
          ordem?: number | null
          semana_id?: string
          titulo_treino?: string
        }
        Relationships: [
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_aluno: { Args: { _user_id: string }; Returns: boolean }
      is_my_student: { Args: { _student_user_id: string }; Returns: boolean }
      is_treinador: { Args: { _user_id: string }; Returns: boolean }
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
