# <div align="center">🤖 AutoCV Bot 🤖</div>
<div align="center">
  
![AutoCV Banner](https://img.shields.io/badge/AUTOCV-WhatsApp%20CV%20Bot-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)
[![Status](https://img.shields.io/badge/status-em%20desenvolvimento-yellow.svg)](https://github.com/zBeyond5/AutoCV)
</div>
<p align="center">
  <sub>Desenvolvido com ❤️ para profissionais em busca de oportunidades</sub>
</p>
<div align="center">
  <img src="https://img.shields.io/badge/⭐%20Star%20para%20receber%20atualizações!-orange?style=for-the-badge" alt="Star to receive updates">
</div>
<div align="center">
  
[![GitHub stars](https://img.shields.io/github/stars/zBeyond5?style=social)](https://github.com/zBeyond5/zBeyond5/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
</div>

## 📋 Conteúdo
- [🌟 Introdução](#-introdução)
- [🛠️ Tecnologias](#️-tecnologias)
- [📥 Instalação](#-instalação)
- [🎯 Funcionalidades](#-funcionalidades)
- [📝 Guia de Uso](#-guia-de-uso)
- [📊 Histórico e Estatísticas](#-histórico-e-estatísticas)
- [🚀 Contribuição](#-contribuição)
- [🔒 Privacidade e Segurança](#-privacidade-e-segurança)
- [❓ FAQ](#-faq)
- [📬 Contato](#-contato)

## 🌟 Introdução
**AutoCV** é um assistente automatizado premium para envio de currículos via WhatsApp, projetado para revolucionar seu processo de candidatura a vagas de emprego. Nossa solução otimiza o tempo de busca, permitindo que você distribua seu currículo para múltiplos recrutadores com mensagens personalizadas de acordo com o cargo.

> 💡 **Nota:** AutoCV está constantemente evoluindo para melhorar a experiência do usuário e maximizar suas chances de destaque no mercado.

<div align="center">
  <img src="https://img.shields.io/badge/🔄%20Atualizado%20Regularmente-blue?style=for-the-badge" alt="Atualizado Regularmente">
</div>

## 🛠️ Tecnologias
<div align="center">
  
![Python](https://img.shields.io/badge/python-3.8+-blue.svg?logo=python&logoColor=white)
![Flet](https://img.shields.io/badge/flet-UI%20Framework-purple.svg)
![PyWhatKit](https://img.shields.io/badge/PyWhatKit-WhatsApp%20Automation-25D366.svg?logo=whatsapp&logoColor=white)
![PyAutoGUI](https://img.shields.io/badge/PyAutoGUI-Automation-orange.svg)
![Threading](https://img.shields.io/badge/Threading-Parallel%20Processing-lightblue.svg)
</div>

- **Core:** Python 3.8+, Threading para processamento paralelo
- **Interface:** Flet Framework, Flet-Rive (animações), Flet-Audio (sons)
- **Automação:** PyWhatKit (WhatsApp), PyAutoGUI (interface)
- **Armazenamento:** Sistema CSV para registros e logs

## 📥 Instalação
```bash
# Clone o repositório
git clone https://github.com/zBeyond5/autocv.git

# Entre no diretório
cd autocv

# Instale as dependências
pip install -r requirements.txt

# Execute a aplicação
python main.py
```

## 🎯 Funcionalidades
<div align="center">
  <img src="https://img.shields.io/badge/⚡%20RECURSOS%20PREMIUM%20⚡-purple?style=for-the-badge" alt="Recursos Premium">
</div>

### Core Features
- ✅ Envio automatizado de currículos via WhatsApp Web
- ✅ Personalização da mensagem conforme o cargo da vaga
- ✅ Anexo automático de arquivos PDF (currículo)
- ✅ Detecção inteligente de saudação (bom dia/boa tarde/boa noite)

### Experiência Premium
- ✅ Interface gráfica moderna com animações e efeitos visuais
- ✅ Reprodução de sons de feedback para ações
- ✅ Tema claro/escuro personalizável
- ✅ Atalhos de teclado configuráveis

### Análise Avançada
- ✅ Registro detalhado de histórico de envios
- ✅ Estatísticas de resposta e taxa de sucesso
- ✅ Prevenção inteligente de envios duplicados

## 📝 Guia de Uso
### Envio Básico
```python
# Exemplo de uso programático do AutoCV
from autocv import AutoCVSender

sender = AutoCVSender()
sender.set_cv("meu_curriculo.pdf")
sender.set_message("Olá, gostaria de me candidatar para a vaga de {cargo}. Segue meu currículo em anexo.")
sender.add_contact("61999999999", "Desenvolvedor Python")
sender.send()
```

### Envio em Massa
<details>
<summary><b>Ver detalhes de envio em massa</b></summary>

Para enviar para múltiplos contatos, adicione cada número em uma nova linha no campo de destinatários:

```
61999999999 - Desenvolvedor Front-end
62888888888 - Analista Python
6377777777 - Engenheiro de Software
```

O sistema processa cada envio sequencialmente, com intervalos aleatórios para evitar bloqueios.
</details>

### Personalização de Mensagens
<details>
<summary><b>Templates de mensagens</b></summary>

O AutoCV oferece templates profissionais pré-configurados:

1. **Candidatura Formal**:
```
Prezado(a) recrutador(a),

Venho por meio desta mensagem manifestar meu interesse na vaga de {cargo}. 
Possuo as qualificações necessárias e estou disponível para entrevistas.
Segue em anexo meu currículo para sua avaliação.

Atenciosamente,
[Seu Nome]
```

2. **Abordagem Direta**:
```
Olá! Vi a oportunidade para {cargo} e gostaria de me candidatar.
Tenho experiência relevante e posso agregar valor à sua equipe.
Anexei meu CV com detalhes da minha trajetória profissional.
```
</details>

## 📊 Histórico e Estatísticas
O sistema mantém registro detalhado de:
- 📅 Data e hora do envio
- 👥 Dados do recrutador
- 🏢 Cargo da vaga
- ✓ Status da candidatura (enviado/visualizado/respondido)

<div align="center">
  <img src="https://img.shields.io/badge/📊%20Tracking%20Avançado-green?style=for-the-badge" alt="Tracking Avançado">
</div>

## 🚀 Contribuição
<details>
<summary><b>Como contribuir com o projeto</b></summary>

1. Faça um fork do projeto
2. Crie sua branch de feature (`git checkout -b feature/RecursoIncrivel`)
3. Commit suas alterações (`git commit -m 'Adiciona recurso incrível'`)
4. Push para a branch (`git push origin feature/RecursoIncrivel`)
5. Abra um Pull Request

Agradecemos todas as contribuições, desde correções de bugs até novos recursos!
</details>

## 🔒 Privacidade e Segurança
- 🔐 Todos os dados são armazenados apenas localmente
- 🛡️ Nenhuma informação é compartilhada com servidores externos
- 📝 Logs mantidos exclusivamente para prevenir envios duplicados

## ❓ FAQ
<details>
<summary><b>O AutoCV é detectado como spam pelo WhatsApp?</b></summary>
Não! Desenvolvemos nosso sistema com foco em segurança. Utilizamos métodos anti-detecção como intervalos aleatórios entre mensagens e processamento natural de texto.
</details>

<details>
<summary><b>Posso personalizar completamente as mensagens?</b></summary>
Sim! O AutoCV permite total personalização das mensagens, incluindo variáveis dinâmicas como {cargo}, {empresa}, {nome_recrutador} e muito mais.
</details>

<details>
<summary><b>O sistema funciona com qualquer número?</b></summary>
O AutoCV funciona com qualquer número de WhatsApp válido no formato internacional. Recomendamos adicionar o código do país para melhor compatibilidade.
</details>

<div align="center">
  <img src="https://img.shields.io/badge/⚡%20Obrigado%20por%20escolher%20AutoCV%20⚡-purple?style=for-the-badge" alt="Thanks">
</div>

## 📬 Contato
📧 Email: [christyan.henrique@gmail.com](mailto:christyan.henrique@gmail.com)  
🌐 GitHub: [@zBeyond5](https://github.com/zBeyond5)

<div align="center">
  <sub>© 2023 AutoCV - Desenvolvido com 💻 e ☕</sub>
</div>
