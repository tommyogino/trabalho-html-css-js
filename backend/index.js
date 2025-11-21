//configurar os imports das bibliotecas 
//npm install express dotenv @supabase/supabase-js
import express from "express";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();

app.use(express.json());

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
    options: { data: { full_name: fullName, username: username } }
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.status(200).json({ message: "Usuário criado com sucesso", user: data.user });
});


// rota de login
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  res.json({
    message: "Login realizado!",
    user: data.user,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token
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
    users: data.users
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


// rota para o usuário criar uma lista
app.post("/lists", authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { name } = req.body;

  const { data, error } = await supabase
    .from("wish_list")
    .insert([{ name, user_id: userId }])
    .select();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.status(200).json({
    message: "Lista criada com sucesso",
    list: data[0]
  });
});


// iniciar o servidor
app.listen(3000, () => {
  console.log("O servidor subiu na porta 3000");
});
