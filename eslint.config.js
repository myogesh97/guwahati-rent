import tseslint from 'typescript-eslint';

export default tseslint.config({ ignores: ['dist', 'supabase/functions'] }, ...tseslint.configs.recommended);
