# Círculo Trigonométrico Interativo

Aplicação web educacional para explorar o ciclo trigonométrico de forma visual: arraste o
ângulo no círculo, compare com o gráfico das funções e consulte a tabela de ângulos notáveis.

O projeto é 100% estático (HTML + CSS + JavaScript, sem build e sem dependências de
servidor), pronto para publicar em qualquer hospedagem de sites.

## Recursos

- Círculo trigonométrico unitário com ângulo arrastável (mouse e toque).
- Giro animado do círculo por uma quantidade informada de períodos (cada período é uma volta completa de 5 segundos), com botão para parar.
- No modo **Círculo**, controles independentes para exibir seno, cosseno, tangente e quadrantes; o campo para inserir ângulos fica no painel lateral, abaixo dos valores atuais.
- Leitura em tempo real de **seno**, **cosseno** e **tangente**, em graus e radianos.
- Modo **gráfico** inicia com os eixos X e Y, sem funções desenhadas, com o eixo X numerado de -3 a 3 em radianos. Também aceita funções personalizadas de seno/cosseno (como `y = a sen(bx + c) + d`); `c` é informado em radianos. Aplicar uma entrada vazia volta às curvas padrão.
- Arraste de qualquer ponto da área do gráfico para o bloco no canto superior direito para salvar aquela função como miniatura neste navegador. Com gráficos empilhados, arraste da faixa da função desejada. Depois, arraste uma função salva para o gráfico (ou selecione-a) para compará-la com a função atual; cada função aparece em seu próprio gráfico, empilhado acima ou abaixo.
- Inserção de ângulos entre 0° e 360°, em graus, radianos ou múltiplos de π.
- Tabela de ângulos notáveis dos quatro quadrantes.
- Tema claro e escuro com preferência salva no navegador.
- Layout responsivo: painel lateral no desktop e gaveta deslizante no celular.
- Atalhos de teclado e foco visível para navegação acessível.

## Arquivos

Todos os arquivos do projeto ficam nesta pasta, sem subpastas. `index.html`,
`styles.css`, `app.js` e `logo.png` formam o site. Os arquivos auxiliares com prefixo
`_`, as imagens de captura e `index-original.html`/`logo-original.png` são ferramentas,
diagnósticos, imagens ou versões antigas mantidos como referência.

O projeto não possui back-end: não há servidor de aplicação, API ou banco de dados.

## Rodar localmente

Basta abrir `index.html` no navegador. Para servir por HTTP a partir desta pasta:

```bash
python -m http.server 5173
# depois acesse http://localhost:5173/
```

## Publicar

Como não há etapa de build, publique os arquivos do site (`index.html`, `styles.css`,
`app.js` e `logo.png`) em qualquer hospedagem estática. As capturas e arquivos de
desenvolvimento são opcionais.

- **Netlify / Vercel:** configure a pasta do projeto como diretório de publicação.
- **GitHub Pages:** publique a pasta do projeto. Confirme que `logo.png` foi enviado ao repositório, com esse nome e letras minúsculas.
- **Hospedagem tradicional (cPanel, S3, etc.):** copie os arquivos do site para o diretório público.

Antes de publicar, atualize as URLs absolutas de compartilhamento (`og:url`, `og:image`) e
adicione uma imagem de capa (1200 × 630 px) caso queira pré-visualização em redes sociais.

## Personalização

- **Cores e espaçamentos:** variáveis CSS no topo de `styles.css` (`:root` e `[data-theme="dark"]`).
- **Cores do canvas:** objeto `THEMES` no início de `app.js`.
- **Conteúdo didático:** textos e a tabela ficam em `index.html`.

## Atalhos

| Tecla | Ação |
| --- | --- |
| `R` | Reinicia a visualização |
| `T` | Abre/fecha a tabela de ângulos notáveis |
| `Esc` | Fecha painéis abertos |

## Compatibilidade

Navegadores modernos com suporte a Canvas 2D, `ResizeObserver`, Pointer Events e variáveis
CSS (Chrome/Edge 111+, Firefox 113+, Safari 16.4+). Em navegadores sem `color-mix()` há
fallback de cor sólida; sem as fontes do Google, a interface usa a pilha de fontes do sistema.
