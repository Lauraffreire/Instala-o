# Pages of You — instalação

Instalação de leitura por gestos em HTML, CSS e JavaScript. Consulta os livros
públicos no Supabase e usa a câmara para interpretar movimentos das mãos e
detetar a presença do visitante. Não cria contas nem escreve na base de dados.

## Executar

Na pasta `Instalação`, executar:

```powershell
python -m http.server 5501
```

Abrir `http://localhost:5501/` e permitir o acesso à câmara. A entrada alternativa
`http://localhost:5501/instalacao/` também se mantém disponível.
O acesso à câmara requer localhost ou HTTPS. O carregamento do MediaPipe,
dos modelos, das fontes e dos livros publicados exige acesso à Internet.
Não são necessários pacotes npm nem compilação.

## JavaScript

| Ficheiro em `instalacao/` | Responsabilidade |
| --- | --- |
| `js/state.js` | Estado partilhado, utilitários, tempos e constantes. |
| `js/hand-feedback.js` | Silhueta e detalhes das mãos apresentados no canvas. |
| `js/collection.js` | Consulta e atualização da coleção pública. |
| `js/shelf.js` | Estante, seleção de livros e deslocamento lateral. |
| `js/reader.js` | Conteúdos das páginas, leitura e fotografias ampliadas. |
| `js/gestures.js` | Interpretação dos pontos das mãos, folhear, puxar e permanência. |
| `js/camera.js` | Câmara, modelos MediaPipe, presença e ciclo de reconhecimento. |
| `instalacao.js` | Eventos e arranque da aplicação. |
| `objects.js` | Representação dos objetos decorativos dos livros. |
| `supabase/client.js` | Cliente anónimo, limitado à leitura de livros públicos. |

Os scripts clássicos partilham o âmbito da aplicação e são carregados com
`defer`. Manter a ordem dos scripts nas duas entradas HTML; o ficheiro
`instalacao.js` é executado por último.

## Gestos e presença

- A posição da palma seleciona o livro na estante.
- Fechar os dedos e puxar abre o livro selecionado.
- Deslocar a mão aberta lateralmente percorre a estante ou vira páginas.
- Estender o indicador e permanecer sobre um botão ativa a seleção.
- A distância entre o polegar e o indicador controla a ampliação da fotografia.
- Entre várias mãos, a maior área da palma é usada como aproximação à mão mais
  próxima da câmara.

O Hand Landmarker está configurado para até quatro mãos e o Pose Landmarker
para até duas pessoas. Os parâmetros dos modelos ficam em `js/camera.js`.
A seleção por permanência demora 1300 ms e o regresso à estante acontece após
60000 ms sem presença, quando o modelo de presença está disponível. Estas
constantes ficam em `js/state.js`. Baixar a mão mantém o livro aberto.
Os limiares e os tempos existentes foram preservados na organização.

O processamento das imagens é feito no navegador. O código não grava nem envia
as imagens da câmara para a base de dados. Os cliques gerados pelo sistema de
permanência continuam ativos; o controlo manual por rato e teclado permanece
bloqueado como na implementação anterior.

## Estilos e fontes

`instalacao/estilos.css` carrega os componentes pela ordem da cascata:

- `css/base.css`: definição única de fontes e cores, base e controlos.
- `css/shelf.css`: estante e lombadas.
- `css/reader.css`: páginas, composições e navegação de leitura.
- `css/overlays.css`: rodapé, diálogos e ampliação.
- `css/tracking.css`: cursor, canvas, animações e adaptações responsivas.

`instalacao/identidade.css` importa Manrope e carrega `css/identity.css` depois
dos componentes. Esta folha contém apenas as regras da identidade utilizadas
pela instalação, sem os ecrãs de criação e autenticação do site.

A fonte principal da interface é **Manrope**, definida em `css/base.css`.
As composições publicadas conservam as fontes escolhidas no editor; os textos
de páginas antigas mantêm a tipografia de leitura existente.

## Dados

`instalacao/supabase/config.js` contém o endereço e a chave pública do projeto.
As políticas SQL do Supabase continuam a controlar o acesso aos dados.
A instalação só consulta `poy_books` com visibilidade pública, sem guardar uma
sessão de autenticação. A coleção é atualizada a cada 10 segundos e quando
a janela recebe foco.

As bibliotecas em `supabase/vendor/` são dependências externas e conservam as
respetivas licenças. O diretório antigo `criacao/` não é carregado pela instalação
e não faz parte desta reorganização; o site de criação atual está em
`../pages-of-you/`.

## Verificar

```powershell
python tests/check_installation.py
```

O teste usa Chrome ou Edge invisível, com perfil temporário, livros e modelos
simulados. Não pede acesso à câmara real nem altera o Supabase. Verifica leitura,
seleção, puxar, folhear, ampliação, cancelamento, presença, ausência, atualização
da coleção e libertação dos modelos. Também verifica o cliente de leitura com
um SDK simulado e recolhe amostras dos estilos calculados.

Não requer pacotes Python adicionais. `CHROME_PATH` permite indicar o navegador.
`--baseline` executa os mesmos testes com os ficheiros da revisão Git `HEAD`.
As fontes externas são omitidas durante a comparação local dos estilos.

Os testes simulados não substituem a experimentação física da iluminação,
enquadramento, reconhecimento das mãos e disponibilidade dos serviços online.

## Entrega

Conservar `index.html` e a pasta `instalacao/`, com os seus caminhos relativos.
Não copiar o código da instalação para cima do site de criação nem o inverso.
Não colocar chaves secretas ou `service_role` nos ficheiros públicos.
