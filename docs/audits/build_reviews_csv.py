import csv, datetime, collections

rows = []
# Capterra (parsed from capterra.com.sg page dumps)
for r in csv.DictReader(open('capterra_reviews.csv', encoding='utf-8')):
    try:
        d = datetime.datetime.strptime(r['date'], '%d %B %Y').strftime('%Y-%m-%d')
    except Exception:
        d = r['date']
    parts = [r['title'], r['overall'],
             ('Pros: ' + r['pros']) if r['pros'] else '',
             ('Cons: ' + r['cons']) if r['cons'] else '']
    rows.append(dict(source='Capterra', url=r['url'], date=d, rating=r['rating'],
                     text=' | '.join(p for p in parts if p)))

# G2 (page 1 of 5 only; pagination not reachable)
for r in csv.DictReader(open('g2_reviews.csv', encoding='utf-8')):
    try:
        d = datetime.datetime.strptime(r['date'], '%m/%d/%Y').strftime('%Y-%m-%d')
    except Exception:
        d = r['date']
    rows.append(dict(source='G2', url=r['url'], date=d, rating=r['rating'],
                     text=f"{r['title']} | Like: {r['like']} | Dislike: {r['dislike']}"))

# Reclame Aqui (24 complaints; titles from list pages, excerpts from the 10 full pages read)
RA = 'https://www.reclameaqui.com.br/reportei/'
ra = [
    ('2026-09-04', 'Solicitação de cancelamento de conta e cobranças indevidas no cartão de crédito.', RA + 'solicitacao-de-cancelamento-de-conta-e-cobrancas-indevidas-no-cartao-de-credito_2KeoMpQ4QPin_7eZ/'),
    ('2026-05-12', 'Tentativa de cancelamento de conta e cartão por mais de 3 meses com cobranças indevidas persistentes.', RA + 'tentativa-de-cancelamento-de-conta-e-cartao-por-mais-de-3-meses-com-cobrancas-indevidas-persistentes_pyvBaANalfC2kwD0/'),
    ('2026-05-02', 'Cobrança indevida de ferramenta cancelada', RA + 'cobranca-indevida-de-ferramenta-cancelada_DAFsHJusSDW3w2ZZ/'),
    ('2026-03-04', 'Dados incorretos e falta de suporte na plataforma Reportei | Os relatórios estão apresentando dados errados e inconsistentes em comparação com as métricas reais das redes sociais. Ao tentar corrigir essas informações, percebi que não há qualquer possibilidade de ajuste anual ou manual nos dados, o que inviabiliza completamente o uso profissional da ferramenta. Já tentei contato com o suporte diversas vezes por diferentes canais, mas nunca obtive retorno.', RA + 'dados-incorretos-e-falta-de-suporte-na-plataforma-reportei_pb_hodAQFqtzHm7R/'),
    ('2025-12-01', 'Dificuldade no cancelamento da conta e falta de acesso à plataforma', RA + 'dificuldade-no-cancelamento-da-conta-e-falta-de-acesso-a-plataforma_Noh3sQys2IeyVEfP/'),
    ('2025-11-20', 'Instabilidade da plataforma Reportei Flux causa prejuízos e clientes insatisfeitos. | Paguei o serviço da reportei flux, e a plataforma está em constante instabilidade , não posta .', RA + 'instabilidade-da-plataforma-reportei-flux-causa-prejuizos-e-clientes-insatisfeitos-solicito-cancelamento-e-estorno_wtSWxZELJ-Yg4Mgn/'),
    ('2025-11-11', 'Instabilidade do sistema causa perda de produtividade e retrabalho | Não conseguem estabilizar seus sistemas para manterem contas conectadas fazendo com que você, usuário PAGANTE, tenha que refazer suas tarefas um zilhão de vezes', RA + 'instabilidade-do-sistema-causa-perda-de-produtividade-e-retrabalho_NfMvIRUA0lpM2biB/'),
    ('2025-11-11', 'Dificuldade de conexão no Instagram, falta de opção de cancelamento e suporte ineficiente no Reportei Flux. | Quero cancelar mais não vejo opção no site.', RA + 'dificuldade-de-conexao-no-instagram-falta-de-opcao-de-cancelamento-e-suporte-ineficiente-no-reportei-flux_dNjvyjNTlxxn7jko/'),
    ('2025-11-03', 'Cobrança indevida de plano anual e dificuldade de contato com o suporte da Reportei', RA + 'cobranca-indevida-de-plano-anual-e-dificuldade-de-contato-com-o-suporte-da-reportei_JikM9yGqgyh5C_CC/'),
    ('2025-10-22', 'Problemas de integração com META e suporte ineficiente da Reportei | estou com dor de cabeça para fazer um simples processo mediante a um problema de comunicação da Reportei com o META. Vim aqui pois o suporte deles não está respondendo, eles estão implantando um bot que por algum motivo está falando em outro idioma comigo', RA + 'problemas-de-integracao-com-meta-e-suporte-ineficiente-da-reportei_g6g4LEpetTD81fFX/'),
    ('2025-04-18', 'Taxas surpresa sem aviso sem consentimento', RA + 'taxas-surpresa-sem-aviso-sem-consentimento_lab2QR5rtK0GDOnk/'),
    ('2025-01-20', 'Reembolso e cancelamento do plano | desisti da compra nao gostei da plataforma, quero reembolso imediato e cancelamento da compra.', RA + 'reembolso-e-cancelamento-do-plano_5LMokngYosQqu8Tc/'),
    ('2024-12-16', 'cobranças mesmo depois doc ancelamento | Cancelei minha conta e mesmo assim continuam cobrando no meu cartão de credito!', RA + 'cobrancas-mesmo-depois-doc-ancelamento_xJCD8J35Km3S5rrT/'),
    ('2024-09-13', 'Paguei, e tentei acessar, mas tão cobrando pra pagar para acessar', RA + 'paguei-e-tentei-acessar-mas-tao-cobrando-pra-pagar-para-acessar_NI3TVMvCeBMHyOcX/'),
    ('2024-04-18', 'Reembolso - Tiraram uma funcionalidade importante, não informaram e se recusam estorno | uma metrica importantissima para mim é a comparação com o periodo anterior, e "do nada" o report que criei agora em Abril veio sem esta funcionalidade', RA + 'reembolso-tiraram-uma-funcionalidade-importante-nao-informaram-e-se-recusam-estorno_Q242eOg0Thwc1n8W/'),
    ('2024-04-01', 'PLATAFORMA O DIA INTEIRO SEM FUNCIONAR E SEM SUPORTE | NÃO CONSIGO EMITIR RELATÓRIOS NO PRIMEIRO DIA ÚTIL DO MÊS, O DIA INTEIRO, A PLATAFORMA NÃO EMITIU NENHUM COMUNICADO DE INSTABILIDADE', RA + 'plataforma-o-dia-inteiro-sem-funcionar-e-sem-suporte_1fHV3RGbp9taZrJd/'),
    ('2024-03-11', 'Estavam com uma promoção em aberto encerram mas alteram o site e quando tentava contratar nao conseguia.', RA + 'estavam-com-uma-promocao-em-aberto-encerram-mas-alteram-o-site-e-quando-tentava-contratar-nao-conseguia_sLKlWu6FahN83l26/'),
    ('2023-12-04', 'Métricas não abrem. Sobreposição de itens | Tento gerar uma métrica e não funciona. Ao levar o dado para o relatório, ele sobrepõe todas as informações, impossibilitando a visualização.', RA + 'metricas-nao-abrem-sobreposicao-de-itens_kBC6rKKoi-9GuT6n/'),
    ('2023-10-06', 'A empresa não apresenta solução. | Os relatórios gerados constantemente contém erros e que não são solucionados rapidamente, quando são solucionados. Pior, o suporte só funciona em horário comercial e de 2 a 6f.', RA + 'a-empresa-nao-apresenta-solucao_JxdPGEm9PLYQYAO9/'),
    ('2023-09-16', 'Estorno do Valor pago | Fiz o cancelamento do plano por não uso e não recebi o estorno do valor pago.', RA + 'estorno-do-valor-pago_gDSNBlFpgyetn_XW/'),
    ('2023-08-15', 'A empresa infringiu a LGPD, Lei Geral de Proteção de Dados Pessoais (Lei n 13.709/2018)', RA + 'a-empresa-infringiu-a-lgpd-lei-geral-de-protecao-de-dados-pessoais-lei-n-137092018_OqcNtdcknq9r3wyP/'),
    ('2023-07-04', 'Não gostei da plataforma, quero meu reembolso', RA + 'nao-gostei-da-plataforma-quero-meu-reembolso_92SFXQRQlWP00Unx/'),
    ('2023-06-01', 'Erro na Plataforma | É bem complicado a Reportei, pagamos um valor que não é barato, e praticamente todos os dias, as integrações ficam caindo.', RA + 'erro-na-plataforma_drZlBE42HaT-gfwi/'),
    ('2022-12-22', 'MESMO COM PLANO CANCELADO FUI COBRADO', RA + 'mesmo-com-plano-cancelado-fui-cobrado_1S8nx0MC6XaRlQ0y/'),
]
for d, t, u in ra:
    rows.append(dict(source='Reclame Aqui', url=u, date=d, rating='1', text=t))

# AppSumo (first page of 35, read through the fetch tool)
rows.append(dict(source='AppSumo', url='https://appsumo.com/products/reportei/reviews/', date='2022-01-11', rating='4',
                 text="Still in Beta | Can only integrate with LinkedIn company pages, didn't see this anywhere on sales copy."))
# B2B Stack (1 review)
rows.append(dict(source='B2B Stack', url='https://www.b2bstack.com.br/product/reportei', date='2023-12-28', rating='4.5',
                 text='a integração com algumas plataformas poderia ser mais fluida e ágil | seria interessante ter mais opções de customização nos dashboards'))
# HubSpot Marketplace (1 review)
rows.append(dict(source='HubSpot Marketplace', url='https://ecosystem.hubspot.com/marketplace/listing/reportei-1462414', date='2023-12-18', rating='1',
                 text='Integração Reportei e HubSpot horrível | Horrível, tentei integrar e puxar alguns dados mas não funciona, não consigo fazer análise nenhuma e nem selecionar os campos que gostaria de puxar. Perdi tempo, nota 0.'))

with open('reviews.csv', 'w', newline='', encoding='utf-8') as fh:
    w = csv.DictWriter(fh, fieldnames=['source', 'url', 'date', 'rating', 'text'])
    w.writeheader(); w.writerows(rows)
print(len(rows), collections.Counter(r['source'] for r in rows))
