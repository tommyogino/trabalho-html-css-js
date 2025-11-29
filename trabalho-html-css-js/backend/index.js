//configurar os imports das bibliotecas
//npm install express dotenv @supabase/supabase-js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());

// client para login/registro
const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLIC_KEY
);

// client com permissões para mexer no banco
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ROLE_KEY
);

// rotas de autenticação
app.post("/auth/register", async (req, res) => {
  const { email, password, fullName, username } = req.body;
  const { data, error } = await supabaseAuth.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, username: username } },
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res
    .status(200)
    .json({ message: "Usuário criado com sucesso", user: data.user });
});

// rota de login
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  res.json({
    message: "Login realizado!",
    user: data.user,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});

// rota para listar todos os usuários (apenas para admin)
app.get("/auth/users", async (req, res) => {
  const adminToken = req.headers["x-admin-token"];

  if (adminToken !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: "Acesso negado" });
  }

  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({
    count: data.users.length,
    users: data.users,
  });
});

// middleware para autenticar o usuário
async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  const token = authHeader.split(" ")[1];

  const { data, error } = await supabaseAuth.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ error: "Token inválido" });
  }

  req.user = data.user;
  next();
}

// 1. LISTAR OS LIVROS (Com busca)
app.get("/books", async (req, res) => {
  const { busca } = req.query;

  let query = supabase
    .from("books")
    .select("*")
    .order("created_at", { ascending: false });

  if (busca) {
    query = query.ilike("title", `%${busca}%`);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 2. ADICIONAR OS LIVROS (Com validação de Ano)
app.post("/books", authenticateUser, async (req, res) => {
  const { title, author, year, ISBN, sinopse, editora, rating, preco } =
    req.body;

  // Validação 1: Campos obrigatórios
  if (!title || !author || !year) {
    return res
      .status(400)
      .json({ error: "Título, Autor e Ano são obrigatórios" });
  }

  // Validação 2: Integridade do dado (Ano)
  const anoAtual = new Date().getFullYear();
  if (year < 1000 || year > anoAtual + 1) {
    // coloquei para aceitar até o ano que vem (pré-venda)
    return res.status(400).json({ error: "Insira um ano válido." });
  }

  const { data, error } = await supabase
    .from("books")
    .insert([
      {
        title,
        author,
        year,
        ISBN,
        sinopse,
        editora,
        rating,
        preco,
        available: true,
      },
    ])
    .select();

  if (error) return res.status(400).json({ error: error.message });

  res.status(200).json({ message: "Livro adicionado", book: data[0] });
});

// 3. MUDAR STATUS (Disponível/Emprestado)
app.patch("/books/:id/status", authenticateUser, async (req, res) => {
  const { id } = req.params;
  const { available } = req.body;

  const { error } = await supabase
    .from("books")
    .update({ available })
    .eq("id", id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: "Status atualizado!" });
});

// 4. DELETAR LIVRO (Com verificação se existia)
app.delete("/books/:id", authenticateUser, async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("books")
    .delete()
    .eq("id", id)
    .select(); // O segredo é pedir para retornar o que foi deletado

  if (error) return res.status(500).json({ error: error.message });

  // Se o array 'data' estiver vazio, nada foi apagado (ID não existia)
  if (data.length === 0) {
    return res
      .status(404)
      .json({ error: "Livro não encontrado para exclusão." });
  }

  res.json({ message: "Livro removido com sucesso" });
});

// iniciar o servidor
app.listen(3000, () => {
  console.log("O servidor subiu na porta 3000");
});
