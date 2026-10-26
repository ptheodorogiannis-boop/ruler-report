# Reportei — what real users complain about, miss and wish for (research for Ruler Reports)

Date: 2026-10-21. Method: `replica-entrepreneur` (read review pages in the browser, copy verbatim, rank). Every quote below is verbatim from the linked page; Portuguese (PT) and Spanish (ES) quotes carry an English gloss in square brackets, which is mine, not the reviewer's. Nothing was paraphrased as a quote.

## 1. Sample and sources

| Source | What was read | Count | Notes |
|---|---|---|---|
| Capterra (via the `capterra.com.sg` mirror; `capterra.com`, GetApp and Software Advice return 403 / Cloudflare to tools) | all review pages, every rating | **240 of 241** reviews, full Pros/Cons/Overall text | 182×5★, 52×4★, 4×3★, 1×2★, 1×1★. 165 are from 2023 (vendor-invited, "Incentivized" tag on Software Advice), 8 from 2025 (LATAM, Spanish), 1 from 2024, 5 from 2026 (none negative). GetApp and Software Advice show the same 241-review pool. |
| G2 — https://www.g2.com/products/reportei/reviews | page 1 only (pagination not reachable in the pane) | **10 of 49** (39×5★, 9×4★, 1×3★) | newest is 16 Mar 2026 |
| Reclame Aqui — https://www.reclameaqui.com.br/empresa/reportei/lista-reclamacoes/ | all 5 list pages + 10 full complaints | **24 complaints** (Dec 2022 → Sep 2026) | 14 billing/cancellation, 10 product/support. Reputation "Sem reputação definida". Most recent and most negative source. |
| AppSumo — https://appsumo.com/products/reportei/reviews/ | page 1 of 7 (fetch tool) | 5 of 35 (25×5, 7×4, 1×3, 2×2) | 2022 lifetime deal, sold out |
| YouTube — official tutorial https://www.youtube.com/watch?v=yPf9ZWZoHdU (17K views, 33 comments, 17 loaded) and an affiliate review https://www.youtube.com/watch?v=D45E4CXyFIY | comments | 19 comments | official channel "Renan e Rodrigo do Reportei" |
| B2B Stack, HubSpot Marketplace, LinkedIn Pulse (2018 Reportei × DashGoo), Reportei blog comments | 1 + 1 + 1 article + 1 comment | 4 | |
| Reportei help centre (8 articles on limitations), "Retrospectiva 2025" changelog, pricing page, plan-difference article | official statements | — | used to confirm complaints and to avoid "fixing" what already shipped |
| Competitors (Capterra SG mirror, 3★ and lowest pages): AgencyAnalytics (116), Swydo (96), Whatagraph (84), DashThis (26), Google Data Studio/Looker Studio (338); Google Developer forum thread on Looker Studio | category-level complaints | ~20 reviews read | |

**Total Reportei-specific items read: 277 review rows in `reviews.csv` (240 Capterra, 24 Reclame Aqui, 10 G2, 3 other) plus 19 YouTube comments, 4 articles/comments and 8 help-centre pages.**

Not reachable from this environment (stated, not guessed): **Reddit** (reddit.com blocked for both the fetch tool and the browser pane; web search returned nothing Reportei-specific), **Trustpilot** (no profile: `trustpilot.com/review/reportei.com` is 404), **Product Hunt** (listing exists, launched 5 Jun 2019, "No reviews yet", no comments), **G2 pages 2–5**, a **public feature-request board / roadmap** (none exists; the help centre has no roadmap category, the changelog is a yearly blog "Retrospectiva").

Bias to keep in mind: 97% of Capterra reviews are positive and most were vendor-invited in Jan–Jun 2023, so the useful material is in the Cons field of 4–5★ reviews ("love it, but…"). Reclame Aqui is complaints-only. Recent (2024–2026) negative signal comes almost entirely from Reclame Aqui, G2 and the LATAM Spanish reviews.

The skill's ranking tool (`reviews.py` with `themes_reportei.json`) output is in `feedback.md`; its regex counts over-match on short words ("plano", "erro"), so the counts below are my hand-checked counts from `capterra_cons_by_theme.md`, `notes_reclameaqui.md`, `g2_reviews.csv` and `notes_youtube_other.md`.

---

## 2. Ranked themes

### A. What they hate (complaints about things Reportei does)

#### A1. Integrations drop, tokens expire, you reintegrate "periodically" — and nobody warns you
~15 reviews across 4 sources (Capterra 7, G2 4, Reclame Aqui 4, help centre confirms). The single most consistent *recent* complaint (G2 Mar 2026, RA Oct–Nov 2025).

- G2, Brittany R., 16 Mar 2026, 5/5 (EN): "Sometimes the integrations will disconnect and it causes us to not be able to accurately reference previous date's data" — https://www.g2.com/products/reportei/reviews
- G2, Daniela E., 20 Jan 2024, 4.5/5 (EN, AI-translated): "The channels keep disintegrating. Every time a report is generated, it's necessary to reintegrate several tools, and sometimes, in the rush, this is a bit annoying." — https://www.g2.com/products/reportei/reviews
- G2, Giordano D., 28 Mar 2024, 3.5/5 (EN): "Should have some general monitor for renewing integrations, what I mean with that is if has access with one of your platforms should check all the others and already renew everything at once, I know this is possible for Meta (Facebook and Instagram), because it is possible to do it on another tool called Sprout." — https://www.g2.com/products/reportei/reviews
- Capterra, Laura (Head Operations, Brazil), 14 Mar 2023, 5.0 (PT): "Algumas automações acabam não funcionando como o planejado e as páginas acabam desconectando com muita frequência" [some automations don't run as planned and the pages disconnect very often] — https://www.capterra.com.sg/software/180418/reportei?page=4&sort=most_recent
- Capterra, Raissa (Social Media, Brazil), 15 Mar 2023, 5.0 (PT): "Uma sugestão de melhoria seria avisar via e-mail que a conta está prestes a expirar, e não depois que já estiver expirada." [warn by e-mail that the account is about to expire, not after it has expired] — https://www.capterra.com.sg/software/180418/reportei?page=4&sort=most_recent
- Capterra, Luciane (Proprietária, Brazil), 18 Oct 2022, 4.0 (PT): "Entendo que muitas vezes é questão da plataforma conectada (principalmente LinkedIn), mas com frequência é preciso refazer a integração." [often it's the connected platform's fault (mainly LinkedIn), but you frequently have to redo the integration] — https://www.capterra.com.sg/software/180418/reportei?page=3&sort=most_recent&overall_rating_ge=4
- Reclame Aqui, "Erro na Plataforma", Brasília, 01/06/2023, unresolved (PT): "É bem complicado a Reportei, pagamos um valor que não é barato, e praticamente todos os dias, as integrações ficam caindo." [we pay a price that isn't cheap and practically every day the integrations drop] — consumer's reply: "Não tem nenhuma questão de senha, muito pelo contrário, não troco as senhas justamente por causa disso" [no password issue, I don't change passwords precisely because of this] — https://www.reclameaqui.com.br/reportei/erro-na-plataforma_drZlBE42HaT-gfwi/
- Reclame Aqui, "Instabilidade do sistema causa perda de produtividade e retrabalho", Araras-SP, 11/11/2025 (PT): "Não conseguem estabilizar seus sistemas para manterem contas conectadas fazendo com que você, usuário PAGANTE, tenha que refazer suas tarefas um zilhão de vezes, perdendo produtividade e foco E PAGANDO MICO COM SEUS CLIENTES." [they can't keep accounts connected, so you, a PAYING user, redo your tasks a zillion times and look bad in front of your clients] — https://www.reclameaqui.com.br/reportei/instabilidade-do-sistema-causa-perda-de-produtividade-e-retrabalho_NfMvIRUA0lpM2biB/

Official confirmation: help-centre article "Por que preciso reintegrar minhas contas?" says tokens "precisam estar sempre ativos para que o envio desses dados através da API* de cada rede/canal seja possível" and "Essa é única forma dos relatórios serem gerados sem nenhum erro." — https://reportei.com/central-de-ajuda/por-que-preciso-reintegrar-minha-conta/

#### A2. Numbers don't match the platform ("qual delas está correta?") and cannot be corrected
~11 reviews across 4 sources (Capterra 7, Reclame Aqui 1 in 2026, YouTube 2, help centre has three articles explaining divergences).

- Capterra, Danilo (Diretor, Brazil), 30 May 2023, 4.0 (PT): "As métricas são imprecisas, o que compromete a veracidade dos relatórios." [the metrics are imprecise, which compromises the truthfulness of the reports] — https://www.capterra.com.sg/software/180418/reportei?page=2&sort=most_recent
- Capterra, Henrique (Autônomo, Brazil), 23 Feb 2023, 4.0 (PT): "Gosto bastante do Reportei, mas alguns dados divergem dos mostrados em outras plataformas, o que sempre deixa o usuário com a dúvida: qual delas está correta?" [some numbers differ from the ones the platforms show, which always leaves you wondering which one is right] — https://www.capterra.com.sg/software/180418/reportei?page=2&sort=most_recent&overall_rating_ge=4
- Capterra, Raphael (CEO, Brazil), 23 Feb 2023, 4.0 (PT): "Algumas integrações são instáveis e não funcionam 100%. Alguns dados não batem com os painéis originais." [some integrations are unstable; some figures don't match the original dashboards] — https://www.capterra.com.sg/software/180418/reportei?page=2&sort=most_recent&overall_rating_ge=4
- Capterra, André (Associate, Canada), 19 Aug 2022, 4.0 (EN): "Data does not always seem to be accurate" — https://www.capterra.com.sg/software/180418/reportei?page=3&sort=most_recent&overall_rating_ge=4
- Reclame Aqui, "Dados incorretos e falta de suporte na plataforma Reportei", Porto Velho-RO, 04/03/2026 (PT): "Os relatórios estão apresentando dados errados e inconsistentes em comparação com as métricas reais das redes sociais. Ao tentar corrigir essas informações, percebi que não há qualquer possibilidade de ajuste anual ou manual nos dados, o que inviabiliza completamente o uso profissional da ferramenta." [the reports show wrong, inconsistent data versus the real network metrics; there is no way to adjust the data manually, which makes professional use impossible] — follow-up: "Os relatórios apresentam alterações no número de seguidores por cidade. … Esses dados não batiam nem com a leitura anterior nem com o ganho de seguidores no período." — https://www.reclameaqui.com.br/reportei/dados-incorretos-e-falta-de-suporte-na-plataforma-reportei_pb_hodAQFqtzHm7R/
- YouTube, @diogofrost0135, 1 year ago (PT): "Eu reparei que os dados dos relatórios da reportei não coincidem com os dados que estão no meta, tem alguma solução para isso?" [the Reportei numbers don't match what's in Meta, is there a fix?] — https://www.youtube.com/watch?v=yPf9ZWZoHdU

Official context: "Os dados do meu relatório/dashboard de Meta Ads não estão iguais aos do Gerenciador" (period filter, account name, account-vs-campaign totals) — https://reportei.com/central-de-ajuda/os-dados-do-meu-relatorio-dashboard-de-meta-ads-nao-estao-iguais-aos-do-gerenciador-o-que-fazer/ ; LinkedIn Ads: "para proteger a privacidade de seus usuários, as métricas de dados demográficos são apenas aproximadas" — https://reportei.com/central-de-ajuda/precisao-dos-dados-no-relatorio-do-linkedin-ads/ ; reach: "Infelizmente o Facebook e o Instagram não repassam pela API o alcance único de um período selecionado" — https://reportei.com/central-de-ajuda/dados-dos-relatorios-no-reportei/

#### A3. Pricing by project with a 5-project floor, and features/integrations gated by plan
~35 Capterra reviews mention price/plans in Cons (the largest single bucket), plus G2 and both 2025 Spanish reviews; 14 of the 24 Reclame Aqui complaints are billing/cancellation (those go to `/replica-launch`, not the product). Current list prices (https://reportei.com/planos-e-precos/): Starter R$ 74,90, Pro R$ 109,90, Premium R$ 199,90 per month for up to 5 projects; G2 shows USD 24 / 39 / 79. Starter: 1 account per network per project, 3 users, 10 platforms; LinkedIn Ads, Search Console, Mailchimp, Pinterest, TikTok Ads, WooCommerce etc. are Pro+; HubSpot, ActiveCampaign, Shopify are Premium-only (https://reportei.com/central-de-ajuda/qual-a-diferenca-entre-os-planos-starter-pro-e-premium/).

- Capterra, Rayza (Social Media Manager, Chile), 16 Apr 2025, 5.0 (ES): "Precio por proyectos, por más de 5 el valor es muy costoso." [price per project; above 5 it gets very expensive] — https://www.capterra.com.sg/software/180418/reportei?page=1&sort=most_recent
- Capterra, José (Director de Marketing, Colombia), 24 Feb 2025, 5.0 (ES): "Hay algunas limitantes en cuanto a la cantidad de cuentas en el plan pro, salta de 10 a 15 por 79 dólares mensuales. Metricool que también que es una herramienta que tiene funciones similares y conexión a Loocke studio es más economica." [the Pro plan jumps from 10 to 15 accounts for 79 dollars a month; Metricool, with similar functions and a Looker Studio connection, is cheaper] — same URL
- Capterra, Verified Reviewer (Broadcast Media), 19 Apr 2023, 5.0 (PT): "Preciso pagar a partir de 5 perfis. se quiser usar 1 só, pago o preço de 5" [I have to pay from 5 profiles up; if I only want 1, I pay for 5] — https://www.capterra.com.sg/software/180418/reportei?page=3&sort=most_recent
- Capterra, Tatiana (Marketing Executive, Brazil), 8 Feb 2023, 5.0 (PT): "Acho correto ter planos por número de clientes, mas as opções de integrações deveriam ser as mesmas em todos os planos. Por exemplo, queria integração com Pinterest para um cliente, mas só por conta disso não compensa eu fazer upgrade de plano." [plans by client count are fair, but integrations should be the same on every plan; upgrading just for Pinterest for one client isn't worth it] — https://www.capterra.com.sg/software/180418/reportei?page=6&sort=most_recent&overall_rating_ge=4
- Capterra, Márcia (Gestora de Tráfego), 7 Jun 2023, 5.0 (PT): "Algumas funções adicionais precisam ser pagas mesmo no mesmo projeto" [some extra functions have to be paid for even within the same project] — https://www.capterra.com.sg/software/180418/reportei?page=2&sort=most_recent
- G2, Alessandro B., 15 Dec 2023, 5/5 (EN): "The downside for me would be the number of dashboards I can create with my plan. I know I could upgrade my plan to get more dashboards, but the cost would be too high for the number of clients I manage." — https://www.g2.com/products/reportei/reviews

Category echo: Swydo, Capterra, razvan (Romania), 11 Apr 2025, 2.0: "the fact that they will charge you extra, without any notice if you go above the data connections in your plan" — https://www.capterra.com.sg/software/159323/swydo?overall_rating_ge=2&sort=most_recent ; AgencyAnalytics, Shaikat, 21 Jan 2023: "Expensive. Pricing could be lower per client" — https://www.capterra.com.sg/software/158746/agency-analytics?overall_rating_le=2&sort=most_recent

#### A4. Bugs, slowness, broken PDFs, outages on the first business day of the month
~20 Capterra mentions (mostly mild) + 4 Reclame Aqui + Software Advice; the PDF export specifically appears 5 times (Capterra ×3 incl. the only 1★, Reclame Aqui ×1, plus a 2024 outage reply admitting PDF export errors).

- Capterra, Ronaldo (CMO, Brazil), 28 Oct 2024, **1.0** (PT): "Interface de escolha de métricas, dados inconsistentes, relatórios em pdf desconfigurados. Não tem opções avançadas de combinar métricas em um só gráfico, layout do funil." [metric-picker UI, inconsistent data, broken-layout PDF reports; no advanced option to combine metrics in one chart; funnel layout] — https://www.capterra.com.sg/software/180418/reportei?page=2&sort=most_recent
- Capterra, Nai (CEO, Uruguay), 24 Feb 2025, 5.0 (ES): "Que a veces demora en cargar métricas o se desajusta visualmente." [sometimes it's slow to load metrics or the layout breaks visually] — https://www.capterra.com.sg/software/180418/reportei?page=1&sort=most_recent
- Capterra, Mauricio (CMO, Brazil), 23 Feb 2023, 4.0 (PT): "lentidão ao emitir relatórios mais antigos" [slow when generating older reports] — https://www.capterra.com.sg/software/180418/reportei?page=2&sort=most_recent&overall_rating_ge=4
- Software Advice, Marina F., Oct 2022, 4 (EN): "The upload of the images breaks a lot of times." — https://www.softwareadvice.com/bi/reportei-profile/reviews/
- Reclame Aqui, "PLATAFORMA O DIA INTEIRO SEM FUNCIONAR E SEM SUPORTE", Petrópolis-RJ, 01/04/2024 (PT): "NÃO CONSIGO EMITIR RELATÓRIOS NO PRIMEIRO DIA ÚTIL DO MÊS, O DIA INTEIRO, A PLATAFORMA NÃO EMITIU NENHUM COMUNICADO DE INSTABILIDADE" [can't generate reports on the first business day of the month, all day, and the platform issued no instability notice]; company reply: "instabilidade na parte da manhã devido ao volume de acessos simultâneos … erros ao exportar alguns PDFs" — https://www.reclameaqui.com.br/reportei/plataforma-o-dia-inteiro-sem-funcionar-e-sem-suporte_1fHV3RGbp9taZrJd/
- Reclame Aqui, "A empresa não apresenta solução.", São Paulo, 06/10/2023 (PT): "Os relatórios gerados constantemente contém erros e que não são solucionados rapidamente, quando são solucionados." … "Já perdi os prazos para a entrega do relatório e fui prejudicado junto ao cliente por confiar na plataforma da Reportei." [reports constantly contain errors; I missed client deadlines by trusting the platform] — https://www.reclameaqui.com.br/reportei/a-empresa-nao-apresenta-solucao_JxdPGEm9PLYQYAO9/

Category echo (same month-start load problem): AgencyAnalytics, Capterra, Sam (Director, Australia), 13 Dec 2021: "It's super stable (although occasionally prone to crash on the first of the month when server load must be very high)" — https://www.capterra.com.sg/software/158746/agency-analytics?overall_rating_ge=2&sort=most_recent

#### A5. Support: chat-only, Brazilian business hours (Mon–Fri 08:30–18:00 BRT = 13:30–23:00 Athens), a bot that answers in the wrong language
5 Reclame Aqui complaints 2023–2026 (concentrated in one source; Capterra reviewers mostly praise support, so this is a *when-it-breaks* problem, not a daily one).

- Reclame Aqui, "A empresa não apresenta solução.", 06/10/2023 (PT): "Pior, o suporte só funciona em horário comercial e de 2 a 6f. Para uma empresa que oferece serviços online 24h, entendo ser um absurdo." [support only works business hours Mon–Fri; absurd for a 24h online service] — https://www.reclameaqui.com.br/reportei/a-empresa-nao-apresenta-solucao_JxdPGEm9PLYQYAO9/
- Reclame Aqui, "Problemas de integração com META e suporte ineficiente da Reportei", Niterói-RJ, 22/10/2025 (PT): "Vim aqui pois o suporte deles não está respondendo, eles estão implantando um bot que por algum motivo está falando em outro idioma comigo e não consegue entender a solicitação. Me surpreende uma empresa cara como a reportei não ter um canal mais ativo de suporte" [support isn't answering; they're rolling out a bot that talks to me in another language and can't understand the request]; company reply confirms "nosso horário de atendimento (que é de segunda a sexta, das 8h30 às 18h)" and the bot "acabou interpretando parte da conversa em espanhol" — https://www.reclameaqui.com.br/reportei/problemas-de-integracao-com-meta-e-suporte-ineficiente-da-reportei_g6g4LEpetTD81fFX/
- Reclame Aqui, "Dados incorretos…", 04/03/2026: "Já tentei contato com o suporte diversas vezes por diferentes canais, mas nunca obtive retorno."; company: "nosso atendimento oficial é realizado exclusivamente via chat dentro da plataforma e pelo e-mail, não possuindo suporte ativo via WhatsApp." — link in A2

#### A6. Reports confuse the end client: too many numbers, negative % from period comparison, CTR compared in % not points, no way to show agency fee
~8 reviews, 2 sources (Capterra/Software Advice). Thin-ish but very actionable.

- Software Advice, Laura P., May 2019, 5 (EN): "The Facebook & Instagram ads analysis is not so great, it gets a little confusing for my clients. Too many numbers for them! Maybe a simplified version would suit them best. They just want to know where they money is going." — https://www.softwareadvice.com/bi/reportei-profile/reviews/
- Capterra, Leonardo (CEO, Brazil), 14 Mar 2023, 4.0 (PT): "Algumas métricas pré-definidas nos relatórios podem gerar confusão no cliente com percentuais negativos, tendo em vista que compara faixas de tempo específicas. Deveria haver de forma pré-estabelecida o destaque para métricas positivas." [predefined metrics confuse the client with negative percentages because of the period comparison; positive metrics should be highlighted by default] — https://www.capterra.com.sg/software/180418/reportei?page=4&sort=most_recent
- Software Advice, Robert D., Jun 2022, 4 (EN): "I don't like the fact that as an agency we cannot show the ad spend including our agency fee but only ad cost. This is confusing for our clients who pay ad cost and agency fees together." — https://www.softwareadvice.com/bi/reportei-profile/reviews/
- Capterra, Ricardo (Especialista de mídia, Brazil), 24 Feb 2023, 4.0 (PT): "No geral, as taxas de CTR são comparadas percentualmente o que não é o mais indicado.Por exemplo, uma taxa A de 0,60% e outra B de 0,50%. Se comparadas, a A não é 20% melhor do que a B. E sim, 0,10 pontos percentuais melhor em relação a outra." [CTRs are compared as a percentage change, which is wrong; 0.60% vs 0.50% is 0.10 points better, not 20%] — https://www.capterra.com.sg/software/180418/reportei?page=2&sort=most_recent&overall_rating_ge=4

Related: a feature was removed silently — Reclame Aqui, "Reembolso - Tiraram uma funcionalidade importante", Recife, 18/04/2024: "uma metrica importantissima para mim é a comparação com o periodo anterior, e "do nada" o report que criei agora em Abril veio sem esta funcionalidade" … "Ja havia migrado para outro competidor." — https://www.reclameaqui.com.br/reportei/reembolso-tiraram-uma-funcionalidade-importante-nao-informaram-e-se-recusam-estorno_Q242eOg0Thwc1n8W/ ; G2, Giordano D., 28 Mar 2024: "Removed month to month comparison for some metrics, this choice should be up to the user;"

#### A7. AI analysis is shallow (thin: 1 direct review + official admission)
- G2, Tomas R., 18 Dec 2023, 4.5/5 (EN): "Also their AI it's not as good as it should be, it always gives obvious analysis and doesn't go as deep as it should." — https://www.g2.com/products/reportei/reviews
- Reportei's own help centre admits "podem haver inconstâncias" and offers one regeneration — https://reportei.com/central-de-ajuda/conheca-o-reportei-ai/

### B. What is missing (features asked for by name)

#### B1. Branding and visual customisation: client logo, cover, header banner, footer, colour palette, per-page identity
~25 Capterra reviews name it (the largest *request* bucket), + YouTube + B2B Stack + the 2018 DashGoo comparison + AgencyAnalytics/Whatagraph reviewers asking the same of their tools.

- Capterra, josefina (diretora, Brazil), 24 Jul 2020, 5.0 (PT): "poderia haver uma forma de personalizar os relatorios com o nome do cliente e logomarca" [a way to personalise reports with the client's name and logo] — https://www.capterra.com.sg/software/180418/reportei?page=9&sort=most_recent
- Capterra, Verified Reviewer (Marketing & Advertising), 4 Apr 2023, 5.0 (PT): "falta algumas opções de personalização a mais no relatório, principalmente na questão de branding para o usuário. Seria legal poder personalizar coisas como uma capa mais completa, logotipo com mais variações, etc." [more branding options: a fuller cover, more logo variations] — https://www.capterra.com.sg/software/180418/reportei?page=3&sort=most_recent
- Capterra, Leonardo (Gestor de Tráfego), 6 Apr 2023, 5.0 (PT): "Não é possível personalizar muito o layout dos relatórios/dashboards, acredito que no futuro devem melhorar isso, sendo possivel inserir marcas, rodapés e etc..." [can't customise the layout much; should allow inserting brands, footers, etc.] — same URL
- Capterra, Bruna Faria de (Planejamento e Estratégia), 5 Mar 2023, 5.0 (PT): "Sinto falta de personalizar o header dos relatórios com um banner, por exemplo." [I miss customising the report header with a banner] — https://www.capterra.com.sg/software/180418/reportei?page=2&sort=most_recent
- Capterra, Gabrielle (Dona), 12 Jun 2023, 5.0 (PT): "A customização deveria ser em todas as páginas, pra gente conseguir colocar nossa identidade visual." [customisation should be on every page so we can apply our visual identity] — same URL
- Capterra, Jéssica (Proprietária), 24 Jan 2023, 4.0 (PT): "recurso limitado de gráficos (poderia existe a possibilidade de mudar a paleta de cores por exemplo)" [limited chart options — e.g. change the colour palette] — https://www.capterra.com.sg/software/180418/reportei?page=3&sort=most_recent&overall_rating_ge=4
- YouTube, @vitoriafigueiredo5000, 3 years ago (PT): "posso mudar a cor dos gráficos pra adaptar a minha marca?" [can I change the chart colours to match my brand?] — https://www.youtube.com/watch?v=yPf9ZWZoHdU
- Capterra, Fernando Yuuki (Founder), 5 Apr 2023, 5.0 (EN): "You can't customize the dashboard as I can in Google Data Studio" — https://www.capterra.com.sg/software/180418/reportei?page=3&sort=most_recent
- Capterra, Kelly (Full-funnel marketing specialist, Australia), 23 Feb 2023, 4.0 (EN): "I don’t like not being able to customise element headings, integrate several Google Business Profiles into a single client’s space (for multiple physical locations) without having to reach out to support, and I don’t like that common integrations are missing." Overall: "I was initially pretty happy with Reportei but the more I’ve used it, the more I’ve been annoyed by its limitations. I mostly use a competing product now." — https://www.capterra.com.sg/software/180418/reportei?page=2&sort=most_recent&overall_rating_ge=4

Category echo: AgencyAnalytics, Capterra, Sam, 13 Dec 2021: "The cover page of the reports is super ugly, like unbelievably ugly and they offer no options to customize this."; Feraud, 17 Jul 2025: "What would be nice to for them to have different themes maybe for dashboard."; Whatagraph, Alexandre, 25 Sep 2019: "not enough freedom in the size and design of widget - no choice of landscape format".

#### B2. Cross-channel truth: consolidated totals across networks, calculated/blended metrics, two accounts of one network in one view, per-campaign dashboards
~15 Capterra reviews (incl. one 3★), G2 1, YouTube 1. This is where "we still keep Data Studio" comes from.

- Capterra, Tasso (COO, Brazil), 26 Feb 2023, **3.0** (PT): "Falta de consolidação dos dados, sonar dados da camapnha como um todo de todas as redes, infelizmente não tem." [no data consolidation — summing a campaign's data across all networks — it simply doesn't exist] — https://www.capterra.com.sg/software/180418/reportei?page=6&sort=most_recent&overall_rating_ge=4
- Capterra, Gabriel (consultor, Brazil), 24 Feb 2023, 4.0 (PT): "Falta uma visão de dashboard de verdade, com campos calculados, com visão multicanal (trabalhando dados de vários conectores), etc. Não precisa ser um Power BI ou Loocker, mas ter mais funcionalidades nesse sentido faria muita diferença; Estamos avaliando outras soluções devido a esses gaps." [no real dashboard with calculated fields and a multichannel view; we're evaluating other solutions because of these gaps] — https://www.capterra.com.sg/software/180418/reportei?page=2&sort=most_recent&overall_rating_ge=4
- Capterra, Verified Reviewer, 24 Jan 2023, 4.0 (PT): "Infelizmente, gostaríamos de manter o uso de todos os nossos dashboards no Reportei, mas precisamos hoje manter ferramentas como o Data Studio para outras visualizações de dashboard." [we'd like to keep all dashboards in Reportei but still have to keep Data Studio] — same URL
- Capterra, Barbara (Analista de BI), 2 Mar 2023, 5.0 (PT): "Não dá muito para mudar e alterar o relatório de acordo com a minha necessidade, por exemplo, cruzar os dados de analytics com google ads e facebook ads." [can't cross Analytics data with Google Ads and Facebook Ads] — https://www.capterra.com.sg/software/180418/reportei?page=4&sort=most_recent
- Capterra, Ricardo (Especialista de mídia), 24 Feb 2023, 4.0 (PT): "Possibilidade de somar diferentes campanhas de diferentes plataformas. Exemplo, quanto foi gasto numa campanha de Dia das Mães. A visão do Reportei é limitada individualmente pelas plataformas e não somadas." [sum campaigns across platforms, e.g. total Mother's Day spend; Reportei's view is per platform, never summed] — link in A6
- Capterra, Kristen (Co-founder, Argentina), 16 Aug 2022, 5.0 (EN): "The only thing I have found myself wishing it could do is show two different Facebook Ad accounts on the same dashboard." — https://www.capterra.com.sg/software/180418/reportei?page=9&sort=most_recent
- Capterra, Gabriel (Head de Gestão de Tráfego Pago), 23 Feb 2023, 5.0 (PT): "Não consigo fazer um dashboard separado por campanha" [I can't make a separate dashboard per campaign] — https://www.capterra.com.sg/software/180418/reportei?page=4&sort=most_recent&overall_rating_ge=4
- Capterra, Nicolas (CEO), 1 Oct 2022, 5.0 (EN): "We should be able to "create" metrics and make our own graphs." — https://www.capterra.com.sg/software/180418/reportei?page=9&sort=most_recent
- Capterra, Tiago (Proprietário), 13 Mar 2023, 5.0 (PT): "As métricas manuais não permitem pegar métricas geradas para calcular outras métricas." [manual metrics can't use generated metrics to calculate other metrics] — https://www.capterra.com.sg/software/180418/reportei?page=4&sort=most_recent
- G2, Robson S., 11 Dec 2023, 4.5 (EN): "Not being able to show data from a specific set, when we are filtering by a specific campaign." — https://www.g2.com/products/reportei/reviews

Category echo: Data Studio, Capterra, Camille, 28 Mar 2024, 3.0: "It's sometimes hard to mixed the datas and get the view we had in mind. Representing deep level of campaign is hard." — https://www.capterra.com.sg/software/190616/data-studio?overall_rating_ge=3&sort=most_recent

#### B3. Missing metrics and depth per platform (Meta Ads, Instagram, Google Ads, LinkedIn, GA4 custom events)
~20 Capterra reviews, G2 2, AppSumo 1, YouTube 1. Matches the clone's known catalogue gap (Meta Ads 64 vs 348, GA4 34 vs 96 in `docs/FEATURE_MATRIX.md`).

- Capterra, Rafael Scott (Gestor de Tráfego), 18 Mar 2023, 4.0 (PT): "Algumas métricas eu não consegui encontrar. Custo por engajamento e custo por ThruPlay, por exemplo." [couldn't find cost per engagement and cost per ThruPlay] — https://www.capterra.com.sg/software/180418/reportei?page=4&sort=most_recent
- G2, Priscila P. (Head de Performance), 10 Oct 2023, 5/5: "Some Facebook Ads metrics are missing." — https://www.g2.com/products/reportei/reviews
- G2, Giordano D., 28 Mar 2024: "should implement Engagement Rate vs Impressions, as it is a more familiar metric for digital marketing as a whole, following the example of CTR, which uses impressions instead of reach." — same URL
- Capterra, Jessyca (Growth Marketing, El Salvador), 25 Feb 2025, 5.0 (ES): "Le falta personalización a los dashboard, hay datos que no les puedo hacer tracking como por ejemplo los custom events, en el caso de la visualización de campañas para meta ads es poco amigable" [dashboards lack customisation; can't track custom events; the Meta Ads campaign view is unfriendly] — https://www.capterra.com.sg/software/180418/reportei?page=1&sort=most_recent
- Capterra, isy (redatora), 23 Feb 2023, 4.0 (PT): "Não possui análise de hashtags para os posts do Instragram." — https://www.capterra.com.sg/software/180418/reportei?page=2&sort=most_recent&overall_rating_ge=4
- Capterra, Bianca (CS), 17 Oct 2022, 5.0 (PT): "ficaria mais usual se pudéssemos alterar o comparativo dentro do relatório, sem precisar gerar um novo (adicionando duas datas ali: por exemplo, mês anterior e ano anterior)." [change the comparison inside the report without regenerating it — e.g. previous month and previous year] — https://www.capterra.com.sg/software/180418/reportei?page=6&sort=most_recent&overall_rating_ge=4
- AppSumo, ManyWays, 11 Jan 2022, 4 tacos (EN): "Can only integrate with LinkedIn company pages, didn't see this anywhere on sales copy." — https://appsumo.com/products/reportei/reviews/
- YouTube, @SIDINEI-CJ, 1 year ago (PT): "Deveriam ter metricas de quando a gente manda o lead pro whatsapp bussines" [should have metrics for leads sent to WhatsApp Business] — https://www.youtube.com/watch?v=yPf9ZWZoHdU

#### B4. Export: PDF that keeps its layout; PowerPoint; Excel / Power BI
8 mentions across Capterra, Reclame Aqui, YouTube (thin but persistent 2019→2024). Note: Reportei shipped "Reportei Sync" to Sheets/Looker Studio (Nov 2025) and "Studio" slide decks, so Excel-ish and slide needs are partly addressed now; PDF fidelity still isn't.

- Capterra, Verified Reviewer, 15 Oct 2019, 4.0 (EN): "And Power Point exportation is a must-have as well since a lot of my colleagues show the results to the client via PPT." — https://www.capterra.com.sg/software/180418/reportei?page=3&sort=most_recent&overall_rating_ge=4
- Capterra, Verified Reviewer, 11 Aug 2022, 4.0 (EN): "Originally in Portuguese, some of the interfaces were not properly translated to English. I did not find an option of creating PDF reports." — same URL
- Capterra, Verified Reviewer, 24 Feb 2023, 4.0 (PT): "Melhorou bem, mas acho que a exportação para PDF poderia ser melhorada." [improved a lot, but PDF export could be better] — https://www.capterra.com.sg/software/180418/reportei?page=2&sort=most_recent&overall_rating_ge=4
- YouTube, @brunogalvao1257, 2 years ago (PT): "eu consigo extrair os dados para o excel ou integrar com o Power BI?" [can I extract the data to Excel or integrate with Power BI?] — https://www.youtube.com/watch?v=yPf9ZWZoHdU
- Capterra, Roberto (Atendimento), 29 Mar 2023, 5.0 (PT): "ao exportar os Dashboards de Social Media, poderia ser mais completo, demonstrando todos os criativos que são postados na semana ou mes." [the social-media dashboard export should show all the creatives posted in the week or month] — https://www.capterra.com.sg/software/180418/reportei?page=3&sort=most_recent

#### B5. History and retention: more than 12 months, month-by-month KPI registry, data kept when the account disconnects
6 reviews (Capterra ×4 incl. a 3★, G2 ×1, Software Advice ×1) + help-centre limits. Weak in count, strong in strategic value for a self-hosted product.

- Capterra, Leonardo (Growth Lead), 25 Apr 2023, **3.0** (PT): "Não possui um historiador para guardar os dados, então é meio difícil fazer análises de períodos maiores que doze meses para algumas redes sociais. Pouca liberdade para editar os cards." … "só não utilizo mais por falta de mais funcionalidades." [no data historian, so analysing periods longer than twelve months is hard for some networks; little freedom to edit the cards; I stopped using it for lack of features] — https://www.capterra.com.sg/software/180418/reportei?page=3&sort=most_recent
- Software Advice, Augusto G., Feb 2023, 5 (EN): "I wait for the feature in which we can register the KPIs of each month and analyze them historically." — https://www.softwareadvice.com/bi/reportei-profile/reviews/
- Capterra, Jeorgea Scarlatt (Social Media), 18 Oct 2022, 5.0 (PT): "não conseguir ter visão de crescimento do ano, mesmo selecionando de janeiro a janeiro, o número se conecta e 1 só, mas se tivesse crescimento ao longo dos meses, seria melhor." [can't see growth over the year; Jan-to-Jan collapses into one number instead of month-by-month growth] — https://www.capterra.com.sg/software/180418/reportei?page=4&sort=most_recent&overall_rating_ge=4
- Capterra, tatiana (ceo), 23 Feb 2023, 5.0 (PT): "Algumas integrações não puxam histórico (twitter, etc)" — https://www.capterra.com.sg/software/180418/reportei?page=6&sort=most_recent
- Official limits (help centre "Dados dos relatórios no Reportei"): "O Instagram não envia o histórico de dados de Seguidores e Stories." / "Diferente da maioria das redes, o Linkedin só garante o histórico por até 1 ano!" / "Atualmente a API do Pinterest não garante dados para períodos superiores a 90 dias" — https://reportei.com/central-de-ajuda/dados-dos-relatorios-no-reportei/

#### B6. Language: Portuguese-first UI/translation gaps; report languages are only PT, EN, ES, FR (no Greek)
5 reviews (Capterra ×4, Reclame Aqui bot in Spanish) + official list.

- Capterra, Joshua (Email Copywriter, US), 25 Dec 2021, 5.0 (EN): "every time I need to login the website is not in English. I have to choose English from the dropdown. Not a big deal, but I wish it would remember my geo-location and automatically show me the English translation." — https://www.capterra.com.sg/software/180418/reportei?page=9&sort=most_recent
- Capterra, Verified Reviewer, 11 Aug 2022: "Originally in Portuguese, some of the interfaces were not properly translated to English." — link in B4
- Capterra, Verified Reviewer, 14 May 2019, 5.0 (EN): "Language in my country native brazilian only." — https://www.capterra.com.sg/software/180418/reportei?page=10&sort=most_recent
- Official: report language options are exactly "Português (Brasileiro);" "Inglês;" "Espanhol;" "Francês." — https://reportei.com/central-de-ajuda/como-alterar-o-idioma-dos-meus-relatorios/

#### B7. Template management: "which template did I use?", more ready-made/expert templates, templates that freeze campaign scope
7 Capterra + 2 G2 + 1 help-centre article.

- G2, Tomas R., 18 Dec 2023, 4.5: "If you don't remember which template you used, it's hard to make always the same reports, because the templates they propose you have a lot of different utilities, maybe they can show you which template you used the last time you generated a report." — https://www.g2.com/products/reportei/reviews
- G2, Fillipe Neyl W. (CEO), 22 Sep 2023, 5/5: "The management of template reports could be a little easier/practical." — same URL
- Capterra, Elisiane (CEO), 7 Jun 2023, 5.0 (PT): "Modelos limitados de relatório, poderiam ter alguns exemplos de análises profissionais." [limited report templates; could include examples of professional analyses] — https://www.capterra.com.sg/software/180418/reportei?page=2&sort=most_recent
- Software Advice, Mike G., Aug 2022, 5 (EN): "It would be an improvement if the software gave you pre-made templates to edit. There are a few but not as many as you would find in alternatives." — https://www.softwareadvice.com/bi/reportei-profile/reviews/
- Official: "ao salvar um template, ele fixa as configurações selecionadas naquele momento" [a saved template freezes the settings chosen at that moment, including campaign scope] — https://reportei.com/central-de-ajuda/meu-template-nao-esta-puxando-os-dados-da-forma-que-salvei/

#### B8. Integrations that are missing or shallow (for a Greek agency: GBP multi-location and CRM depth matter; RD Station/Twitter do not)
~20 Capterra + HubSpot Marketplace 1★ + AppSumo. Zapier/Make/n8n, API docs and WhatsApp automation shipped in 2025 (see §3), so those requests are now solved on Reportei's side.

- Capterra, Maik (Analista de Marketing, Education, 1,001–5,000 emp.), 29 May 2023, 4.0 (PT): "O grupo onde trabalho tem vários polos e unidades, então como o reportei tem acesso a somente a uma quantidade limitada de lugares no google meu negocio.. consequente temente temos que escolher quais locais estarão no relatório" [we have many branches; Reportei only accesses a limited number of Google Business Profile locations, so we have to choose which locations go in the report] — https://www.capterra.com.sg/software/180418/reportei?page=2&sort=most_recent
- HubSpot Marketplace, Rossi R., 18 Dec 2023, 1/5 (PT): "Horrível, tentei integrar e puxar alguns dados mas não funciona, não consigo fazer análise nenhuma e nem selecionar os campos que gostaria de puxar. Perdi tempo, nota 0." [tried to integrate and pull data, doesn't work, can't select the fields I want] — https://ecosystem.hubspot.com/marketplace/listing/reportei-1462414
- Capterra, Gustavo (CEO, Netherlands), 23 Feb 2023, 5.0 (EN): "I miss the possibility of adding third party data sources through tools like Zapier, Pabbly Connect or others, although I don't know if it is possible." — https://www.capterra.com.sg/software/180418/reportei?page=6&sort=most_recent (now shipped by Reportei)
- Capterra, Cristian (CEO, Chile), 20 Feb 2025, 5.0 (ES): "Los reportes por mails, son lo menos atractivo y menos custumizables y el tema con YouTube cuando tienes acceso como partner no puedes incorporar" [e-mail reports are the least attractive and least customisable; YouTube can't be connected when you only have partner access] — https://www.capterra.com.sg/software/180418/reportei?page=2&sort=most_recent

#### B9. Post scheduling / all-in-one (Metricool, mLabs comparison) — explicitly asked, deliberately not for the clone
3 Capterra (incl. the only 2★ and a 3★) + Reportei's answer (Flux, 2025) generates its own complaints.

- Capterra, Adrian (CEO, Colombia), 2 Mar 2025, **2.0** (ES): "Poca usabilidad en proyectos. No poder publicar en las redes directamente como si se permite en Metricool es algo que hace gran diferencia" [can't publish to the networks directly as Metricool allows — a big difference]; on Software Advice the same reviewer: "Elegi pensando en mejores metricas pero esta muy limitado comparado con metricool" — https://www.capterra.com.sg/software/180418/reportei?page=1&sort=most_recent
- Capterra, Henrique (Autônomo), 23 Feb 2023, 4.0 (PT): "Preço um pouco salgado, se comparado a outros produtos que oferecem relatórios em adição ao agendamento de postagens" [a bit pricey compared with products that offer reports plus post scheduling] — link in A2
- Reclame Aqui, "Instabilidade da plataforma Reportei Flux…", Goiânia, 20/11/2025: "Paguei o serviço da reportei flux, e a plataforma está em constante instabilidade , não posta ." — https://www.reclameaqui.com.br/reportei/instabilidade-da-plataforma-reportei-flux-causa-prejuizos-e-clientes-insatisfeitos-solicito-cancelamento-e-estorno_wtSWxZELJ-Yg4Mgn/

Minor requests (1–3 mentions each): a mobile app (Ellen, 23 Feb 2023: "Gostaria de poder utilizá-lo no celular."), post-time vs engagement chart (Ricardo, 9 May 2023), unfollows list (ANGELA, 2020), competitor analysis (Rafael, 23 Feb 2023: "Poderia ter dados de insights e ferramentas de análise de concorrência."), reorder networks more easily (Tatiane, Hugo), payment methods (Robson).

### C. What is unsolved (whole jobs or groups Reportei ignores — these become positioning)

1. **Agencies that outgrow 5–10 clients or run multi-location brands.** Per-project pricing plus the 5-project floor and per-plan integration gating (A3) and the GBP location cap (B8). Evidence: ~35 reviews, 3 sources.
2. **Anyone who needs the numbers to be defensible.** No attribution-window/timezone statement on the report, no manual correction, reach double-counted, LinkedIn approximated (A2). Evidence: 11 reviews, 4 sources + 3 official articles.
3. **Teams that need a data warehouse, not a snapshot.** No >12-month history, Instagram/LinkedIn/Pinterest history limited by the API, data "lost" when a token drops (B5, A1). Evidence: 6 + 15 reviews.
4. **Agencies outside Brazil/LATAM.** Reports only in PT/EN/ES/FR, Portuguese-first UI, support in BRT business hours with a bot that switched to Spanish (B6, A5). No Greek anywhere. Evidence: 5 + 5 reviews.
5. **Agencies that must show their own fee / markup on media spend** (Robert D.) and client-readable summaries ("where the money is going") (A6). Evidence: 8 reviews.
6. **People who want reporting and publishing in one tool** (B9) — Reportei built Flux and it is already a complaint magnet. The clone should *not* chase this; position as "reporting that doesn't break because it also tries to post".

---

## 3. Already fixed by Reportei (do not "fix" these)

From "Retrospectiva Reportei 2025" (https://reportei.com/retrospectiva-reportei-2025/) and the help centre: Make/Zapier/n8n connectors and public API docs (Apr 2025) — answers the Zapier/third-party-data requests; campaign duplication in reports (Jan 2025); vertical funnel, highlighted metrics, grouped and calculated metrics in the funnel (Feb 2025); Facebook/Google login, Threads (Mar 2025); table-dimension editing (Jul 2025); Google Ads PMax tables (Aug 2025); WhatsApp report automation (Sep 2025); Reportei Sync → Looker Studio import (Nov 2025); Reportei Flux post scheduling (Jun 2025); Reportei Studio AI slide decks; read receipts for reports; 17 chart themes ("Como mudar as cores dos gráficos (alterar Tema do relatório)"). Still open on Reportei's side as of these pages: per-report cover/branding beyond logo+theme, data warehouse/history, token pre-expiry alerts and bulk re-auth, PDF fidelity, PowerPoint export, Greek language, cross-network campaign totals, agency-fee markup, manual data correction.

---

## 4. Overlap with the five items you flagged

| Your item | Asked for by users? | Evidence (verbatim, linked above) | Clone today (feature matrix) |
|---|---|---|---|
| Client logos on reports | **Yes, repeatedly (6+)** | josefina 2020 "nome do cliente e logomarca"; Verified 4 Apr 2023 "logotipo com mais variações", "capa mais completa"; Leonardo 6 Apr 2023 "inserir marcas, rodapés"; Gabrielle "identidade visual" on all pages; 2018 DashGoo comparison "colocar as logos"; AgencyAnalytics cover-page complaint | White-label = agency logo + one colour; "Cover editor: partial, no per-report cover editor"; "Footer customization: no". Project has a `logo` field (Project settings: yes). |
| Platform icons | **No direct request found.** Closest: Hugo 7 May 2023 "Organize wich network I would to see first"; Tatiane 24 Feb 2023 "Acho difícil só a forma de mudar a ordem das redes sociais"; Darwin "A interface é muito simplória no aspecto de design" | Nobody asked for icons by name; treat as polish that supports B1, not a theme. | Custom block "title only, no colour or icon" |
| Per-report / per-channel colours | **Yes (5+)** | Jéssica "mudar a paleta de cores"; @vitoriafigueiredo5000 "mudar a cor dos gráficos pra adaptar a minha marca"; Gabrielle; Feraud (AgencyAnalytics) "different themes"; Reportei itself has 17 themes + per-block theme | "Report themes (17): no, one brand colour"; "Per-block theme override: no"; custom block has no colour |
| Custom charts and infographics | **Yes (8+)** | Nicolas "create metrics and make our own graphs"; Larissa Gabrielle "Tem algumas métricas que gostaria de fazer gráficos mas não consigo"; Ronaldo 1★ "combinar métricas em um só gráfico"; Amanda 27 May 2023 "Sinto falta de mais gráficos e editaveis"; Jéssica "recurso limitado de gráficos"; Verified 17 Aug 2022 "line charts..., there is room for improvement"; Whatagraph reviewer on widget freedom | Chart: line/bar/pie, group-by; "two axes: no", "reference lines: no", "Manual chart: no"; formula widget exists (can feed a custom chart) |
| Importing images | **Yes (4)** | Marina F. "The upload of the images breaks a lot of times" (Reportei has it, it breaks); Bruna "header dos relatórios com um banner"; Roberto wants post creatives in the export; 2018 comparison praised DashGoo's CSV upload | "Analysis text card … no image upload"; wysiwyg "sanitised HTML, no images" |

Net: four of the five map to the biggest *request* theme (B1) and the chart item maps to B2; only "platform icons" lacks direct user evidence (keep it, but as part of the branding kit rather than as its own feature).

---

## 5. Fix plan for Ruler Reports (mapped to `docs/FEATURE_MATRIX.md` / `replica/features.csv`)

Ordered by evidence × cost. "Has" = what the clone already does per the feature matrix (read-only; nothing was changed there).

| # | Fix | Evidence | Clone has | Build / change | Size | Skill |
|---|---|---|---|---|---|---|
| 1 | **Token watchdog**: nightly token/permission check per integration; e-mail + Slack/Teams alert *before* expiry and before each automation run; "last successful sync" and "data as of" stamp on every shared link; one-click bulk re-auth per network (Google, Meta OAuth already exist); keep serving the last good snapshot and mark it stale instead of failing | A1 (15 reviews, 4 sources; Raissa, Giordano, Brittany) | "Expired-integration notifications: partial (error on project page only)"; "Integration-failure alert e-mail before next run: no"; static reports are snapshots; `data_status` banner; OAuth for Google/Meta | add `IntegrationHealth` job + alert channel reuse (`services/messaging.ts`), stale badge in `/r/[token]` and `/d/[token]`, bulk re-auth page | M | replica-backend |
| 2 | **Defensible numbers**: print attribution window, timezone, currency, "reach is not additive" and fetch time in the report footer and per-widget info; reconciliation widget that shows account total vs sum of campaigns; "override with note" on any number widget (keeps original, shows the correction and who made it) | A2 (11 reviews, 4 sources; RA 2026 "não há qualquer possibilidade de ajuste … manual") | typed errors, `data_status`, reach via `Connector.totals()`, timezone/decimal per project, manual metric widget | metadata block in `engine/report.ts`; `WidgetCustom.override{value,note,by,at}`; footer slot in cover/theme | M | replica-backend + replica-design |
| 3 | **Brand kit per client**: client logo (project already has `logo`), cover image/banner, palette (chart colours + accent), footer text, header banner; per-report cover editor; per-block colour and icon; report themes (match Reportei's 17) with a Greek-agency default; image upload in analysis cards (sanitised, stored, resized) | B1 (25+ reviews), your five flagged items | white-label (agency), one brand colour, custom block title only, analysis card without images, 17 themes "no" | `Project.brand{palette,cover,footer}`, `Report.cover`, `LayoutBlock.color/icon`, theme tokens in charts (`charts.tsx`), upload route + storage | L | replica-design + replica-build |
| 4 | **Cross-channel totals for real**: ready "All paid media" / "All social" group presets (spend, impressions, clicks, leads, CPL, ROAS) built on the existing formula engine; campaign containers (feature matrix "must, gap") with a cross-network campaign tag ("Mother's Day" = Meta campaign X + Google campaign Y); two accounts of the same network in one block (integration rows already separate); **agency fee / markup field per project** applied as `spend_with_fee` so clients see what they pay | B2 (15 reviews incl. a 3★), A6 Robert D. | blended formula engine (+ − × ÷, sum/avg), custom block mixing accounts, per-widget CSV, no campaign containers, "grouped metrics: partial", "cross-network funnel: no" | `catalog` group presets, `container_v1`, `Project.feePercent`, campaign-tag model | L | replica-architect → replica-backend |
| 5 | **Metric depth**: close the catalogue gap first on Meta Ads (cost per ThruPlay, cost per engagement, engagement rate on impressions *and* reach, video metrics), Instagram (hashtag and content-type filters), GA4 custom events/conversions, Google Ads asset ratings and placements, LinkedIn demographics; "compare with: previous period / same period last year" switch inside an existing report without regenerating | B3 (20+), Bianca, G2 Giordano | 64 Meta / 34 GA4 archetypes; per-widget period override; comparison at generation | extend `catalog/archetypes.ts` + connectors; report-level comparison re-snapshot | L | replica-backend |
| 6 | **Exports that survive the client's inbox**: server-rendered PDF (Playwright/Chromium) with page breaks, cover and footer; PPTX from the Studio deck; XLSX whole-report export; "post creatives" gallery widget for social blocks | B4 (8), A4 Ronaldo 1★ | "Share by PDF with page breaks: partial (browser print)"; Studio "no PPTX export"; whole-report CSV exists | print service + `pptxgenjs`/`exceljs` routes | M | replica-build |
| 7 | **History that doesn't expire**: keep every daily fetch in a warehouse table (not only per-report snapshots), backfill on first connect to the API maximum (2 years Meta/Google), monthly KPI registry per project with YoY and 24-month charts; charts that span > 12 months | B5 (6 reviews + official API limits), A1 Brittany | daily series stored per report only; anomaly detection on overview | `MetricDaily(integrationId, key, date, value)` + backfill job + long-range charts | M | replica-backend |
| 8 | **Greek + i18n**: UI in Greek and English, report locale `el-GR` (date/number formats already per project), AI analysis and e-mail/WhatsApp templates in Greek; Greek default theme fonts with proper diacritics in PDF | B6 (5 reviews + official 4-language limit), C4 | "Multi-language UI: no (English only)"; report language is a project field | i18n layer (`next-intl`), translation files, AI prompt language = project locale | M | replica-build |
| 9 | **Client-readable mode**: one-page executive summary ("where the money went"), comparison shown in percentage *points* for rate metrics, positive-is-good highlighting defaults, hide negative-noise widgets for client links, "simple" toggle on share links | A6 (8 reviews) | `isPositiveBad`, highlight, hide widget, AI card | `diff_type: points` for rate metrics; summary template | S | replica-design |
| 10 | **Template hygiene**: show "generated from template X on date" on each report, remember last template per project, expert templates per vertical (e-commerce, lead-gen, local business), template scope warning when campaign selection differs | B7 (9 mentions) | templates with usage counts, save-as-template keeps layout | `Report.templateId` badge, picker default | S | replica-build |
| 11 | **Month-start resilience + status**: stagger scheduled generation, pre-render on the last night of the month, public status page and in-app incident banner (RA: "não emitiu nenhum comunicado de instabilidade") | A4, A5 (RA 2024, AgencyAnalytics "first of the month") | automations with hour; outbox viewer | queue with jitter, `/status` page, banner | S | replica-deploy |
| 12 | **Support independence** (positioning, not code): self-hosted on the agency's own stack, runbook, no business-hours dependency; optionally an in-app "help in Greek" AI assistant over the docs | A5 (5 RA complaints), C4 | self-hosted Docker, MCP server | docs + optional assistant | S | replica-launch |

Not planned: post scheduling (B9) — explicitly out of scope; say so on the landing page. Billing/cancellation complaints (14 Reclame Aqui) → `/replica-launch` (if the product is ever sold: self-serve cancel button, no surprise charges, invoice e-mails).

Suggested rows for `replica/features.csv` (not applied, file is read-only for this task; `original=no` means Reportei doesn't have it):

```
Token pre-expiry alerts and bulk re-auth per network,Integrations,must,no,no,"A1: 15 reviews / 4 sources"
Data-as-of + attribution/timezone footer on every report,Reports,must,no,no,"A2: 11 reviews / 4 sources"
Override a number widget with a note (keeps original),Report editor,should,no,no,"A2 Reclame Aqui 2026"
Per-client brand kit (client logo cover banner palette footer),Theming & cover,must,partial,no,"B1: 25+ reviews"
Image upload in analysis cards,Report editor,should,yes,no,"B1/B4"
Agency fee / markup applied to spend metrics,Report editor,should,no,no,"A6 Robert D."
Cross-network campaign tag and totals,Report editor,should,no,no,"B2: 15 reviews"
Server-rendered PDF with page breaks + PPTX + XLSX export,Sharing & export,must,partial,partial,"B4"
Daily metric warehouse with backfill and >12-month charts,Reports,should,no,no,"B5 + API limits"
Greek UI and el-GR report locale,Projects & account,must,no,no,"B6 / C4"
Rate metrics compared in percentage points,Report editor,could,no,no,"A6 Ricardo"
Status page and incident banner,Projects & account,could,no,no,"A4"
```

---

## 6. Positioning for a self-hosted alternative aimed at a Greek marketing agency

Three options, each grounded in a top theme (template from the skill):

**Option 1 — "Flat cost, your servers, your clients' language"**
For Greek agencies with more than five clients who hate paying per project and being told which integrations their plan allows, Ruler Reports is a self-hosted client-reporting platform with no per-project fee, every connector on every install, and reports in Greek.
Evidence: A3 (~35 reviews, 3 sources), B6/C4 (5 reviews + official 4-language limit), B8 GBP cap (3 reviews).

**Option 2 — "Reports that don't break at 09:00 on the 1st"**
For agencies whose month-start reporting has been blown up by expired tokens and silent outages, Ruler Reports watches every connection, warns before it expires, keeps the last good snapshot and tells the client when the data was fetched.
Evidence: A1 (15 reviews, 4 sources), A4 (RA 2024 outage, AgencyAnalytics "first of the month"), A5 (support hours).

**Option 3 — "Numbers your client can check"**
For performance agencies that get asked "which number is right?", Ruler Reports prints the attribution window, timezone and fetch time on every report, lets you add your management fee to spend, and keeps a 24-month history you own.
Evidence: A2 (11 reviews, 4 sources), A6 Robert D., B5 (6 reviews + API limits).

**Recommendation: Option 1 as the headline, with Option 2 as the first proof point and Option 3 as the second.** Reasons: (a) pricing/plan gating is the largest complaint bucket *and* is structurally unfixable for Reportei (it is their business model), so it cannot be copied back; (b) Greek-language reports and EU hosting are concrete, demonstrable differences for Ruler Agency's market (Reportei is Brazilian, support runs 13:30–23:00 Athens time, and one Reclame Aqui complaint already cites LGPD; GDPR hosting in the EU is a selling line, not a feature); (c) the token watchdog and the data-as-of footer are cheap (M + M) and convert the two most recent negative signals (G2 Mar 2026, Reclame Aqui Mar 2026) into demo moments. Do not put "Reportei" in the product name, ads or listing; a factual comparison page is a question for a Greek lawyer.

Greek-specific details to make the angle real: Greek UI and `el-GR` locale (dates `21/10/2026`, decimal comma), Greek AI summaries and WhatsApp/Viber delivery text, support for Greek-market sources the clone already models as extensions (CSV/REST/Push for Skroutz or local CRMs), and a default theme that renders Greek diacritics correctly in PDF.

---

## 7. Competitor notes (category-level only; full quotes in `notes_competitors.md`)

- **Looker/Data Studio** — the "free" option agencies keep alongside Reportei: slow with large data, modules break when untouched, blending is hard, non-Google connectors cost money. Capterra Sarah (30 Apr 2026): "dashboards that haven't been touched in months would break"; Camille (28 Mar 2024): "It's sometimes hard to mixed the datas"; G2 Raul S.: "for platforms external to Google, it is often necessary to have independent payment connectors."
- **AgencyAnalytics** — per-client pricing, ugly uncustomisable cover, month-start crashes, "inflexibility of the reporting" (Sarfaraz, 3★).
- **Swydo** — surprise overage charges, >500% price increase, template editing frustration.
- **Whatagraph** — source disconnects "for no reason", no 24/7 support for other time zones, widget-size/landscape limits, complex pricing.
- **DashThis** — "the visual aspect" (Brandi, 3★).

The category-wide pattern (disconnects, pricing surprises, branding limits, blending) is the same as Reportei's; the clone's fixes 1, 3 and 4 above are therefore category differentiators, not just Reportei catch-up.

---

## 8. Files produced in this folder

- `reviews.csv` — 277 rows `source,url,date,rating,text` (skill format)
- `feedback.md` — output of the skill's `reviews.py` with `themes_reportei.json` (regex counts; over-matches on short words)
- `capterra_reviews.csv` (240), `capterra_cons_by_theme.md`, `g2_reviews.csv` (10)
- `notes_reclameaqui.md` (24 complaints, 10 full texts), `notes_competitors.md`, `notes_youtube_other.md`
- `raw/` — the browser page dumps the CSVs were parsed from; `parse_capterra.py`, `parse_g2.py`, `build_reviews_csv.py`
