// Testes do servidor (sem navegador): `npm test`
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io } from 'socket.io-client';
import { iniciarServidor } from '../server.js';

const PORTA = 3961;
const URL_ = `http://127.0.0.1:${PORTA}`;
const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'concord-teste-'));
let srv = await iniciarServidor({ porta: PORTA, senha: 'conv', pastaDados: dados });

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const conectar = () => new Promise((r) => { const s = io(URL_, { transports: ['websocket'], forceNew: true }); s.on('connect', () => r(s)); });
const emit = (s, ev, d = null) => new Promise((r) => s.emit(ev, d, r));
const proximo = (s, ev, ms = 1500) => Promise.race([new Promise((r) => s.once(ev, r)), espera(ms).then(() => null)]);
let falhas = 0;
const ok = (nome, cond) => { if (!cond) falhas++; console.log(cond ? '✅' : '❌', nome); };

async function pessoa(usuario, nome, convite = 'conv') {
  const s = await conectar();
  const c = await emit(s, 'conta:criar', { usuario, nome, senha: 'segredo123', convite });
  const e = await emit(s, 'entrar', { token: c.token });
  return Object.assign(s, { conta: e.conta, token: c.token, entrada: e });
}

// ---------- contas e servidores ----------
const leo = await pessoa('leo', 'Leo');
ok('conta nova começa sem servidor', leo.entrada.servidores.length === 0);
ok('sem convite não cria conta', !!(await emit(await conectar(), 'conta:criar', { usuario: 'x1', senha: 'segredo123', convite: 'errado' })).erro);
const { id: srv1 } = await emit(leo, 'servidor:criar', { nome: 'Galera' });
const aberto = await emit(leo, 'servidor:abrir', srv1);
ok('cria servidor com canais padrão', aberto.servidor.canais.map((c) => c.nome).join() === 'geral,Sala 1,Sala 2');
ok('criador é o dono', aberto.perfis[0].dono && aberto.perfis[0].admin);
const geral = aberto.servidor.canais[0].id;
const convite = aberto.servidor.convite;

const ana = await pessoa('ana', 'Ana', convite);
ok('criar conta com convite do servidor já entra nele', ana.entrada.servidores.map((s) => s.id).join() === String(srv1));
await emit(ana, 'servidor:abrir', srv1);
const bia = await pessoa('bia', 'Bia');
ok('quem não é membro não lê o canal', (await emit(bia, 'historico', geral)).length === 0);
ok('nem abre o servidor', !!(await emit(bia, 'servidor:abrir', srv1)).erro);

// ---------- mensagens, respostas e reações ----------
const recebida = proximo(ana, 'mensagem');
leo.emit('mensagem', { canal: geral, texto: 'bora jogar?' });
const m1 = await recebida;
ok('mensagem chega pros membros', m1?.texto === 'bora jogar?' && m1.servidor === srv1 && m1.reacoes.length === 0);
const resp = proximo(leo, 'mensagem');
ana.emit('mensagem', { canal: geral, texto: 'bora!', resposta: m1.id });
const m2 = await resp;
ok('resposta vem com a mensagem original', m2?.resposta?.id === m1.id && m2.resposta.autor === 'Leo' && m2.resposta.texto === 'bora jogar?');

let atual = proximo(leo, 'msg:atualizada');
await emit(ana, 'msg:reagir', { id: m1.id, emoji: '👍' });
let att = await atual;
ok('reagir com emoji', att?.reacoes?.[0]?.emoji === '👍' && att.reacoes[0].contas.join() === String(ana.conta));
atual = proximo(ana, 'msg:atualizada');
await emit(leo, 'msg:reagir', { id: m1.id, emoji: '👍' });
att = await atual;
ok('outra pessoa soma na mesma reação', att?.reacoes[0].contas.length === 2);
atual = proximo(leo, 'msg:atualizada');
await emit(ana, 'msg:reagir', { id: m1.id, emoji: '👍' });
att = await atual;
ok('reagir de novo tira a reação', att?.reacoes[0].contas.join() === String(leo.conta));
ok('emoji com tom de pele/combinado', !(await emit(leo, 'msg:reagir', { id: m1.id, emoji: '👍🏽' })).erro && !(await emit(leo, 'msg:reagir', { id: m1.id, emoji: '👨‍👩‍👧' })).erro);
ok('texto não vale como emoji', !!(await emit(leo, 'msg:reagir', { id: m1.id, emoji: 'oi' })).erro);
ok('quem não é membro não reage', !!(await emit(bia, 'msg:reagir', { id: m1.id, emoji: '😂' })).erro);
const hist = await emit(leo, 'historico', geral);
ok('histórico traz reações e resposta', hist.find((m) => m.id === m1.id).reacoes.length === 3 && hist.find((m) => m.id === m2.id).resposta.id === m1.id);
await emit(leo, 'msg:apagar', m1.id);
ok('resposta de mensagem apagada', (await emit(leo, 'historico', geral)).find((m) => m.id === m2.id).resposta.apagada === true);

// ---------- histórico paginado e busca ----------
for (let i = 0; i < 70; i++) leo.emit('mensagem', { canal: geral, texto: `msg numero ${i}` });
await espera(600);
const pag1 = await emit(leo, 'historico', geral);
ok('primeira página: 50 mais recentes', pag1.length === 50 && pag1.at(-1).texto === 'msg numero 69');
const pag2 = await emit(leo, 'historico', { canal: geral, antes: pag1[0].id });
ok('página anterior continua de onde parou', pag2.length === 21 && pag2.at(-1).id < pag1[0].id && pag2[0].texto === 'bora!');
const busca = await emit(leo, 'buscar', { termo: 'numero 6' });
ok('busca acha no servidor aberto', busca.resultados.length === 11 && busca.resultados.every((m) => m.texto.includes('numero 6')));
ok('busca trata % como texto', (await emit(leo, 'buscar', { termo: '100%' })).resultados.length === 0);
ok('busca curta demais', !!(await emit(leo, 'buscar', { termo: 'a' })).erro);
ok('quem não é membro não acha nada', (await emit(bia, 'buscar', { termo: 'numero' })).resultados.length === 0);

// ---------- arquivos ----------
const arq = proximo(ana, 'mensagem');
const r1 = await emit(leo, 'arquivo', { canal: geral, nome: '../relatório final.html', dados: Buffer.from('<script>alert(1)</script>') });
const mArq = await arq;
ok('envia arquivo qualquer', !r1.erro && /^\/uploads\/[a-f0-9]{24}\/.+\.html$/.test(mArq?.texto ?? ''));
const resArq = await fetch(URL_ + mArq.texto);
ok('nome fica sem ../', decodeURIComponent(mArq.texto).endsWith('/.._relatório final.html') || !decodeURIComponent(mArq.texto).includes('../'));
ok('HTML enviado só baixa, nunca abre como página', resArq.headers.get('content-disposition')?.startsWith('attachment')
  && resArq.headers.get('content-type') === 'application/octet-stream' && /sandbox/.test(resArq.headers.get('content-security-policy')));
const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const arqImg = proximo(ana, 'mensagem');
await emit(leo, 'arquivo', { canal: geral, nome: 'foto.png', dados: png });
ok('imagem enviada como arquivo vira imagem', /^\/uploads\/[a-f0-9]{24}\.png$/.test((await arqImg)?.texto ?? ''));
ok('arquivo não dá pra editar', !!(await emit(leo, 'msg:editar', { id: mArq.id, texto: 'x' })).erro);

// ---------- status ----------
let pres = proximo(ana, 'presenca');
await emit(leo, 'status', { status: 'ocupado', texto: 'Jogando CS2' });
let lista = await pres;
ok('status aparece pros outros', lista?.find((u) => u.nome === 'Leo')?.status === 'ocupado' && lista.find((u) => u.nome === 'Leo').statusTexto === 'Jogando CS2');
pres = proximo(ana, 'presenca');
await emit(leo, 'status', { status: 'invisivel', texto: '' });
lista = await pres;
ok('invisível some da lista dos outros', !lista?.some((u) => u.nome === 'Leo'));
ok('status inválido', !!(await emit(leo, 'status', { status: 'hacker' })).erro);
await emit(leo, 'status', { status: 'online', texto: '' });

// ---------- conversas diretas ----------
ok('não abre DM com quem não divide servidor', !!(await emit(leo, 'dm:abrir', { conta: bia.conta })).erro);
const { dm } = await emit(leo, 'dm:abrir', { conta: ana.conta });
ok('abre DM com membro do servidor', dm?.outro?.nome === 'Ana');
ok('abrir de novo é a mesma conversa', (await emit(ana, 'dm:abrir', { conta: leo.conta })).dm.id === dm.id);
const chegouDm = proximo(ana, 'mensagem');
let vazouDm = false;
bia.once('mensagem', () => (vazouDm = true));
leo.emit('mensagem', { canal: dm.id, texto: 'segredo só nosso' });
const mDm = await chegouDm;
ok('mensagem direta chega', mDm?.texto === 'segredo só nosso' && mDm.servidor === null && mDm.canal === dm.id);
await espera(200);
ok('ninguém mais recebe', !vazouDm);
ok('ninguém mais lê', (await emit(bia, 'historico', dm.id)).length === 0);
const listaDm = await emit(ana, 'dm:lista');
ok('lista de DMs com a outra pessoa', listaDm.dms.length === 1 && listaDm.dms[0].outro.nome === 'Leo' && listaDm.eu.nome === 'Ana');
ok('busca nas DMs (vendo as DMs)', (await emit(ana, 'buscar', { termo: 'segredo' })).resultados.length === 1);
const digit = proximo(leo, 'digitando');
ana.emit('digitando', dm.id);
ok('digitando na DM', (await digit)?.canal === dm.id);
ok('reagir na DM', !(await emit(ana, 'msg:reagir', { id: mDm.id, emoji: '❤️' })).erro);

// ---------- expulsar ----------
await emit(ana, 'servidor:abrir', srv1);
await emit(leo, 'servidor:abrir', srv1);
ok('não admin não expulsa', !!(await emit(ana, 'membro:expulsar', { conta: leo.conta })).erro);
ok('ninguém expulsa o dono', !!(await emit(leo, 'membro:expulsar', { conta: leo.conta })).erro);
const expulso = proximo(ana, 'servidor:expulso');
const novaLista = proximo(ana, 'servidores');
ok('dono expulsa', !(await emit(leo, 'membro:expulsar', { conta: ana.conta })).erro);
ok('expulso é avisado', (await expulso)?.id === srv1);
ok('e o servidor some da lista dele', (await novaLista)?.length === 0);
ok('expulso não lê mais', (await emit(ana, 'historico', geral)).length === 0);
ok('mas a DM continua', (await emit(ana, 'historico', dm.id)).length === 1);
ok('volta com convite', (await emit(ana, 'servidor:entrar', { convite })).id === srv1);

// ---------- backup e reinício ----------
ok('backup do dia criado', fs.readdirSync(path.join(dados, 'backups')).some((f) => /^chat-\d{4}-\d{2}-\d{2}\.db$/.test(f)));
[leo, ana, bia].forEach((s) => s.disconnect());
await srv.fechar();
srv = await iniciarServidor({ porta: PORTA, senha: 'conv', pastaDados: dados });
const leo2 = await conectar();
const e2 = await emit(leo2, 'entrar', { token: leo.token });
ok('depois de reiniciar: servidor, DM e status continuam', e2.servidores.length === 1 && e2.status === 'online'
  && (await emit(leo2, 'historico', dm.id)).length === 1);
leo2.disconnect();
await srv.fechar();
fs.rmSync(dados, { recursive: true, force: true });

console.log(falhas ? `\n${falhas} falha(s)` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
