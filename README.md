# Image Upload App

Este projeto foi criado com React e Vite para demonstrar o upload de imagens via drag and drop.

## Como o projeto foi criado
- Inicialização com Vite e React.
- Estrutura principal em `App.jsx`.
- Estilização básica em `App.css` e `index.css`.
- Upload de imagens implementado com `react-dropzone`.
- Configuração do Vite para desenvolvimento e build.
- Inclusão de SVGs para identidade visual.

## Como rodar o projeto localmente
1. **Instale as dependências:**
   ```bash
   npm install
   ```
2. **Inicie o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```
3. Acesse `http://localhost:5173` no navegador.

## Como implementar upload para AWS S3
1. **Crie um bucket S3 na AWS.**
2. **Configure as credenciais de acesso (IAM).**
3. **Instale o SDK da AWS:**
   ```bash
   npm install aws-sdk
   ```
4. **Exemplo de integração:**
   ```js
   import AWS from 'aws-sdk';

   AWS.config.update({
     accessKeyId: 'SUA_ACCESS_KEY',
     secretAccessKey: 'SUA_SECRET_KEY',
     region: 'sua-regiao'
   });

   const s3 = new AWS.S3();

   function uploadToS3(file) {
     const params = {
       Bucket: 'nome-do-bucket',
       Key: file.name,
       Body: file,
       ContentType: file.type
     };
     return s3.upload(params).promise();
   }
   ```
5. **Nunca exponha suas credenciais no frontend!**
   - Use uma API backend para gerar URLs assinadas ou fazer o upload.

## Referências
- [Documentação AWS S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html)
- [react-dropzone](https://react-dropzone.js.org/)
- [Vite](https://vitejs.dev/)

---
