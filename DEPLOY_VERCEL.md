# Instruções para Deploy na Vercel

Este projeto foi preparado para rodar na Vercel, mas existem pontos importantes sobre o banco de dados:

## 1. Banco de Dados (SQLite)
A Vercel utiliza um sistema de arquivos efêmero (limpa tudo a cada novo deploy ou reinicialização). O arquivo `providers.db` (SQLite) **não persistirá** as alterações feitas pelos usuários na Vercel.

**Recomendação:**
Para produção, você deve substituir o SQLite por um banco de dados na nuvem, como:
- **Supabase** (PostgreSQL)
- **Neon** (PostgreSQL)
- **MongoDB Atlas**
- **Vercel Postgres**

## 2. Como Deployar
1. Conecte seu repositório GitHub à Vercel.
2. A Vercel detectará o projeto Vite.
3. Certifique-se de que as variáveis de ambiente (se houver) estão configuradas no painel da Vercel.
4. O arquivo `vercel.json` já está configurado para rotear as chamadas de API para o servidor Express.

## 3. Importação de Dados
Você pode usar a nova funcionalidade de **Importar (ícone de upload)** para subir seus dados de Excel ou JSON rapidamente após o deploy.
