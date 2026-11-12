# Pages of You — Instalação

A instalação inicia automaticamente por gestos. Não mostra a imagem da câmara, painel técnico, botão de ativação nem comandos de rato ou teclado. Os pontos dos dedos e instruções breves no rodapé mostram o reconhecimento e a ação disponível.

## Abrir

Na pasta `2 fase`, que contém `pages-of-you/` e `instalacao/`, executar:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Criação: http://localhost:8000/pages-of-you/
Instalação: http://localhost:8000/instalacao/
Testes: http://localhost:8000/instalacao/testes.html (usar perfil separado).

O navegador pode pedir autorização para usar a câmara na primeira visita. A página não pode ultrapassar essa autorização. Depois de permitida, a deteção começa automaticamente. Usar localhost ou HTTPS e Internet para carregar os modelos. O vídeo é processado neste dispositivo, sem mostrar imagens da câmara, gravar ou usar microfone.

## Ligação ao site

As duas aplicações ficam em pastas lado a lado e devem usar o mesmo servidor, nome de anfitrião (por exemplo, localhost) e porta. Os livros públicos publicados aparecem automaticamente na instalação no mesmo endereço, navegador e perfil. A instalação lê a chave pages-of-you-v1 em localStorage e não escreve nos dados. Rascunhos e livros privados não aparecem. Verifica alterações por evento de armazenamento, ao recuperar o foco e a cada 2,5 segundos.

Para computadores diferentes é necessário um servidor de dados comum. Abrir por file:// não garante acesso à câmara nem partilha dos livros.

## Gestos

- Mão aberta: percorrer as lombadas.
- Curvar os cinco dedos e puxar para o corpo: abrir o livro selecionado.
- Deslizar a mão aberta lateralmente: folhear. Terminar o movimento antes de repetir.
- Indicador sobre um botão: manter 1,3 segundos para confirmar; o círculo mostra o progresso.
- Afastar polegar e indicador sobre uma foto: ampliar. Juntar os dedos ou retirar a mão: repor.
- Selecionar Voltar à estante com o indicador: terminar a leitura.

Os botões visíveis são alvos dos gestos. O cursor do rato não aparece. A mão ativa tem ligações verdes e pontas amarelas; as restantes aparecem a cinzento. Não existem comandos de rato ou teclado para visitantes.

A maior palma aparente recebe prioridade entre mãos: aproximação à distância numa câmara RGB. Baixar a mão não fecha o livro enquanto o corpo continuar reconhecido. Após 60 segundos sem mão nem corpo, regressa à estante. Se o modelo do corpo falhar, os gestos continuam e o regresso automático fica suspenso. A deteção interrompida durante a utilização tenta reiniciar após três segundos.

Se a autorização for recusada, é necessário permiti-la nas definições do navegador e voltar a abrir a página. As mensagens de arranque e erro aparecem no rodapé.

## Conteúdos e testes

Mostra composições, desenhos, padrões, modelos e fotos com recortes. Não reproduz áudio. Os exemplos são fictícios e vêm de ../pages-of-you/js/dados.js.

HTML, CSS e JavaScript sem compilação. Usa MediaPipe Tasks Vision 0.10.32, HandLandmarker e PoseLandmarker Lite. As adaptações dos projetos fornecidos estão em REFERENCIAS-GESTOS.md.

Os testes verificam dados, leitura, lógica gestual com amostras sintéticas e ausência de controlos manuais. A proximidade, o gesto de puxar e os limiares continuam a precisar de calibração com a câmara física.
