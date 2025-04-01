import pywhatkit as kit
import pyautogui
import time
import os
import webbrowser
import customtkinter as ctk
from tkinter import filedialog, messagebox
from PIL import Image, ImageTk
import threading
import csv
from datetime import datetime

# Função para obter a saudação conforme o horário
def get_saudacao():
    hora_atual = datetime.now().hour
    if 6 <= hora_atual < 12:
        return "Bom dia"
    elif 12 <= hora_atual < 18:
        return "Boa tarde"
    else:
        return "Boa noite"

# Função para registrar o envio em CSV
def registrar_envio(numero, cargo, status):
    data_hora = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    with open('historico_envios.csv', 'a', newline='', encoding='utf-8') as arquivo:
        writer = csv.writer(arquivo)
        if arquivo.tell() == 0:
            writer.writerow(["Data/Hora", "Número", "Cargo", "Status"])
        writer.writerow([data_hora, numero, cargo, status])

# Função para verificar se o número já foi enviado (baseado no histórico)
def ja_enviado(numero_limpo):
    try:
        with open('historico_envios.csv', 'r', encoding='utf-8') as arquivo:
            reader = csv.DictReader(arquivo)
            for row in reader:
                if row["Número"] == numero_limpo:
                    return True
    except FileNotFoundError:
        return False
    return False

# Função para enviar mensagem via WhatsApp (atualizada)
def enviar_mensagem(numero, mensagem, arquivo_pdf):
    try:
        # Separa número e cargo (se informado após o hífen)
        partes = numero.split(" - ", 1)
        numero_limpo = numerocomddd(partes[0].strip())
        cargo = partes[1].strip() if len(partes) > 1 else ""
        
        # Se houver cargo, atualiza a mensagem conforme padrão desejado
        if cargo:
            mensagem = f"{get_saudacao()}, estou enviando meu currículo sobre a vaga de {cargo}. Desde já, agradeço a atenção."
        
        url = f"https://wa.me/{numero_limpo}"
        chrome_path = "C:/Program Files/Google/Chrome/Application/chrome.exe %s"
        webbrowser.get(chrome_path).open(url)
        time.sleep(10)

        kit.sendwhatmsg_instantly(numero_limpo, mensagem, wait_time=10, tab_close=False)
        time.sleep(5)

        pyautogui.click(x=615, y=1000)
        time.sleep(2)
        pyautogui.click(x=626, y=727)
        time.sleep(2)
        pyautogui.write(arquivo_pdf)
        time.sleep(2)
        pyautogui.press('enter')
        time.sleep(2)
        pyautogui.press('enter')
        time.sleep(5)

        registrar_envio(numero_limpo, cargo, "Sucesso")
        print(f"Mensagem enviada para {numero_limpo} - {cargo}")
    except Exception as e:
        registrar_envio(numero_limpo, cargo, f"Erro: {str(e)}")
        print(f"Erro ao enviar mensagem para {numero_limpo}: {e}")

# Função para formatar números (incluindo DDD)
def numerocomddd(numero):
    numero = numero.replace("(", "").replace(")", "").replace("-", "").replace(" ", "")
    return f"+55{numero}"

# Função para escolher arquivo PDF
def escolher_pdf():
    arquivo_pdf = filedialog.askopenfilename(
        title="Escolher arquivo PDF",
        filetypes=(("PDF files", "*.pdf"), ("All files", "*.*"))
    )
    if arquivo_pdf:
        return os.path.basename(arquivo_pdf)
    return None

# Função para enviar mensagens pela interface
def enviar_mensagem_interface():
    global cancelado
    reset_cancelamento()

    numeros = numero_entry.get()
    mensagem = mensagem_entry.get()
    
    if numeros and mensagem:
        numeros_lista = [numero.strip() for numero in numeros.split(",")]
        arquivo_pdf = escolher_pdf()
        
        if not arquivo_pdf:
            messagebox.showwarning("Erro", "Por favor, selecione um arquivo PDF.")
            return
            
        total_numeros = len(numeros_lista)
        enviados = 0
        for i, numero in enumerate(numeros_lista):
            if cancelado:
                messagebox.showinfo("Cancelado", "Envio de mensagens foi interrompido.")
                return
            
            # Extrai o número limpo para verificação
            partes = numero.split(" - ", 1)
            numero_limpo = numerocomddd(partes[0].strip())
            if ja_enviado(numero_limpo):
                print(f"Já enviado para {numero_limpo}. Pulando.")
                enviados += 1
                progresso = (enviados / total_numeros) * 100
                barra_progresso.set(progresso)
                progresso_label.configure(text=f"{int(progresso)}% Concluído")
                root.update_idletasks()
                continue
            
            # Envia a mensagem (a função usa o cargo se informado)
            enviar_mensagem(numero, mensagem, arquivo_pdf)
            
            enviados += 1
            progresso = (enviados / total_numeros) * 100
            barra_progresso.set(progresso)
            progresso_label.configure(text=f"{int(progresso)}% Concluído")
            root.update_idletasks()
            time.sleep(2)
            
        messagebox.showinfo("Sucesso", "Mensagens enviadas com sucesso!")
    else:
        messagebox.showwarning("Erro", "Por favor, insira números válidos e uma mensagem.")

# Função para parar o envio
def parar_envio():
    global cancelado
    cancelado = True

# Função para reiniciar o flag de cancelamento
def reset_cancelamento():
    global cancelado
    cancelado = False

# Função para configurar a hotkey
def configurar_hotkey():
    global current_hotkey
    new_hotkey = hotkey_entry.get() if hotkey_entry.get() else "p"
    if current_hotkey:
        root.unbind_all(f"<KeyPress-{current_hotkey}>")
    current_hotkey = new_hotkey
    root.bind_all(f"<KeyPress-{new_hotkey}>", lambda event: parar_envio())
    messagebox.showinfo("Hotkey", f"Hotkey configurada para '{new_hotkey}'.")

# Função para exibir o histórico de envios em uma nova janela
def mostrar_historico():
    historico_win = ctk.CTkToplevel(root)
    historico_win.title("Histórico de Envios")
    historico_win.geometry("600x400")
    
    # Frame para o conteúdo: textbox com scrollbar
    content_frame = ctk.CTkFrame(historico_win)
    content_frame.pack(fill="both", expand=True, padx=10, pady=10)
    
    txt = ctk.CTkTextbox(content_frame, wrap="none")
    txt.grid(row=0, column=0, sticky="nsew")
    
    scrollbar = ctk.CTkScrollbar(content_frame, orientation="vertical", command=txt.yview)
    scrollbar.grid(row=0, column=1, sticky="ns")
    txt.configure(yscrollcommand=scrollbar.set)
    
    content_frame.grid_rowconfigure(0, weight=1)
    content_frame.grid_columnconfigure(0, weight=1)
    
    # Função para atualizar o conteúdo do histórico
    def atualizar_historico():
        txt.configure(state="normal")
        txt.delete("1.0", "end")
        if not os.path.exists('historico_envios.csv'):
            txt.insert("end", "Nenhum histórico encontrado.")
        else:
            with open('historico_envios.csv', 'r', encoding='utf-8') as arquivo:
                conteudo = arquivo.read()
            txt.insert("end", conteudo)
        txt.configure(state="disabled")
    
    atualizar_historico()
    
    # Frame para botões de atualizar e fechar
    btn_frame = ctk.CTkFrame(historico_win)
    btn_frame.pack(pady=5)
    
    refresh_button = ctk.CTkButton(btn_frame, text="Atualizar", command=atualizar_historico)
    refresh_button.pack(side="left", padx=5)
    
    fechar_button = ctk.CTkButton(btn_frame, text="Fechar", command=historico_win.destroy)
    fechar_button.pack(side="left", padx=5)

# Configurações de tema e variáveis globais
CTK_THEME = {
    "bg_color": "#1c1c1c",
    "fg_color": "#25D366",
    "text_color": "#ffffff",
    "secondary_text_color": "#919191"
}

cancelado = False
current_hotkey = "p"

# Configuração da interface gráfica principal
root = ctk.CTk()
root.title("Mand's Curriculo")
root.iconbitmap("whatsapp_icon.ico")  # Define o ícone da janela
root.geometry("400x550")
root.configure(bg=CTK_THEME["bg_color"])

frame = ctk.CTkFrame(root, fg_color=CTK_THEME["bg_color"], width=480, height=500)
frame.pack(padx=20, pady=20)

# Ícone do WhatsApp (usando o arquivo .ico)
whatsapp_icon = ctk.CTkImage(light_image=Image.open("whatsapp_icon.ico"), size=(40, 40))
whatsapp_icon_label = ctk.CTkLabel(frame, image=whatsapp_icon, text="", fg_color=CTK_THEME["bg_color"])
whatsapp_icon_label.pack(padx=10, pady=10)

# Seção de Hotkey
hotkey_label = ctk.CTkLabel(frame, text="Configure a tecla de atalho para parar o envio:",
                             font=("Poppins Bold", 12), text_color=CTK_THEME["text_color"])
hotkey_label.pack(padx=10, pady=5)
hotkey_entry = ctk.CTkEntry(frame, width=100, font=("Poppins Regular", 12), text_color=CTK_THEME["text_color"])
hotkey_entry.pack(padx=10, pady=5)
hotkey_entry.insert(0, "p")
configurar_hotkey_button = ctk.CTkButton(frame, text="Configurar Hotkey",
                                         command=configurar_hotkey,
                                         font=("Poppins Bold", 12),
                                         fg_color=CTK_THEME["fg_color"],
                                         text_color=CTK_THEME["text_color"])
configurar_hotkey_button.pack(padx=10, pady=5)

# Seção de Mensagem
mensagem_label = ctk.CTkLabel(frame, text="Digite a mensagem a ser enviada:",
                              font=("Poppins Italic", 12), text_color=CTK_THEME["text_color"])
mensagem_label.pack(padx=10, pady=5)
default_message = f"{get_saudacao()}, estou enviando meu currículo sobre a vaga de {cargo}. Desde já, agradeço a atenção."
mensagem_entry = ctk.CTkEntry(frame, width=400,
                              placeholder_text=default_message,
                              font=("Poppins Regular", 12),
                              text_color=CTK_THEME["text_color"])
mensagem_entry.insert(0, default_message)
mensagem_entry.pack(padx=10, pady=5)

# Seção de Números
numero_label = ctk.CTkLabel(frame, text="Insira os números (com DDD, separados por vírgula):",
                            font=("Poppins Italic", 12), text_color=CTK_THEME["text_color"])
numero_label.pack(padx=10, pady=5)
numero_entry = ctk.CTkEntry(frame, width=400,
                            placeholder_text="Exemplo: (61) 99156-7380 - Cargo, (61) 98765-4321 - Outro Cargo",
                            font=("Poppins Regular", 12), text_color=CTK_THEME["text_color"])
numero_entry.pack(padx=10, pady=5)

# Botões de Envio e Parada
enviar_button = ctk.CTkButton(frame, text="Enviar Currículo",
                              command=lambda: threading.Thread(target=enviar_mensagem_interface, daemon=True).start(),
                              font=("Poppins Bold", 12),
                              fg_color=CTK_THEME["fg_color"],
                              text_color=CTK_THEME["text_color"])
enviar_button.pack(padx=10, pady=10)

parar_button = ctk.CTkButton(frame, text="Parar Envio",
                             command=parar_envio,
                             font=("Poppins Bold", 12),
                             fg_color=CTK_THEME["fg_color"],
                             text_color=CTK_THEME["text_color"])
parar_button.pack(padx=10, pady=5)

# Barra de Progresso
progresso_label = ctk.CTkLabel(frame, text="0% Concluído",
                               font=("Poppins Italic", 12), text_color=CTK_THEME["text_color"])
progresso_label.pack(padx=10, pady=5)
barra_progresso = ctk.CTkProgressBar(frame, width=300, mode="determinate")
barra_progresso.pack(padx=10, pady=5)

# Botão para visualizar o histórico de envios
historico_button = ctk.CTkButton(frame, text="Ver Histórico",
                                 command=mostrar_historico,
                                 font=("Poppins Bold", 12),
                                 fg_color=CTK_THEME["fg_color"],
                                 text_color=CTK_THEME["text_color"])
historico_button.pack(padx=10, pady=10)

# Configura a hotkey inicial
configurar_hotkey()

# Inicia a interface gráfica
root.mainloop()
