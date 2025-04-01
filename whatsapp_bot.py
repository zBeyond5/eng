import pywhatkit as kit
import pyautogui
import time
import os
import webbrowser
import threading
import csv
from datetime import datetime

import flet as ft
import flet_audio as fta  # Certifique-se de instalar: pip install flet-audio
import flet_rive as fr    # Certifique-se de instalar: pip install flet-rive

# -------------------- Constantes de Áudio --------------------
JAZZ_URL = "https://luan.xyz/files/audio/ambient_c_motion.mp3"  # Som de fundo
# Sons ajustados para serem mais coerentes com a ação:
CRESCENDO_URL = "https://actions.google.com/sounds/v1/cartoon/slide_whistle_to_drum_hit.ogg"
CLIQUE_URL = "https://actions.google.com/sounds/v1/ui/click.ogg"
NEGATIVO_URL = "https://actions.google.com/sounds/v1/ui/error.ogg"
AFIRMATIVO_URL = "https://actions.google.com/sounds/v1/ui/confirmation.ogg"

# -------------------- Variáveis Globais --------------------
cancelado = False
current_hotkey = "p"  # Hotkey padrão

# -------------------- Funções Auxiliares --------------------
def get_saudacao() -> str:
    hora_atual = datetime.now().hour
    if 6 <= hora_atual < 12:
        return "Bom dia"
    elif 12 <= hora_atual < 18:
        return "Boa tarde"
    else:
        return "Boa noite"

def registrar_envio(numero: str, cargo: str, status: str):
    data_hora = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    arquivo = "historico_envios.csv"
    escrever_header = not os.path.exists(arquivo) or os.path.getsize(arquivo) == 0
    with open(arquivo, 'a', newline='', encoding='utf-8') as arq:
        writer = csv.writer(arq)
        if escrever_header:
            writer.writerow(["Data/Hora", "Número", "Cargo", "Status"])
        writer.writerow([data_hora, numero, cargo, status])

def ja_enviado(numero_limpo: str) -> bool:
    arquivo = "historico_envios.csv"
    if not os.path.exists(arquivo):
        return False
    with open(arquivo, 'r', encoding='utf-8') as arq:
        reader = csv.DictReader(arq)
        for row in reader:
            if row["Número"] == numero_limpo:
                return True
    return False

def numerocomddd(numero: str) -> str:
    numero = numero.replace("(", "").replace(")", "").replace("-", "").replace(" ", "")
    return f"+55{numero}"

# Função para reiniciar e tocar áudio (para efeitos sonoros)
def play_sound(audio_component: fta.Audio):
    audio_component.seek(0)
    audio_component.play()

# -------------------- Funções de Envio --------------------
def enviar_mensagem(numero: str, mensagem: str, arquivo_pdf: str, progress_callback):
    try:
        partes = numero.split(" - ", 1)
        numero_limpo = numerocomddd(partes[0].strip())
        cargo = partes[1].strip() if len(partes) > 1 else ""
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
        progress_callback(f"Mensagem enviada para {numero_limpo} - {cargo}")
    except Exception as e:
        registrar_envio(numero_limpo, cargo, f"Erro: {str(e)}")
        progress_callback(f"Erro ao enviar para {numero_limpo}: {e}")

# -------------------- Thread de Envio --------------------
class EnvioThread(threading.Thread):
    def __init__(self, numeros, mensagem, arquivo_pdf, progress_callback, finish_callback):
        super().__init__()
        self.numeros = numeros
        self.mensagem = mensagem
        self.arquivo_pdf = arquivo_pdf
        self.progress_callback = progress_callback
        self.finish_callback = finish_callback
        self.cancelado = False

    def run(self):
        total = len(self.numeros)
        enviados = 0
        for numero in self.numeros:
            if self.cancelado:
                self.progress_callback("Envio interrompido pelo usuário.")
                break

            partes = numero.split(" - ", 1)
            numero_limpo = numerocomddd(partes[0].strip())
            if ja_enviado(numero_limpo):
                self.progress_callback(f"Já enviado para {numero_limpo}. Pulando.")
                enviados += 1
                progresso = int((enviados / total) * 100)
                self.progress_callback(f"{progresso}% concluído")
                time.sleep(1)
                continue

            enviar_mensagem(numero, self.mensagem, self.arquivo_pdf, self.progress_callback)
            enviados += 1
            progresso = int((enviados / total) * 100)
            self.progress_callback(f"{progresso}% concluído")
            time.sleep(2)
        self.finish_callback()

    def parar(self):
        self.cancelado = True

# -------------------- Funções de Controle --------------------
def reset_cancelamento():
    global cancelado
    cancelado = False

def parar_envio():
    global cancelado
    cancelado = True

# -------------------- Interface com Splash, Áudio e Slider de Volume --------------------
def main(page:ft.Page):
    global current_hotkey
    page.title = "Whatsbot.py"
    page.window.width = 500
    page.window.height = 550
    page.window.resizable = True
    page.window.icon = r"C:\Users\TyanMC\Desktop\AutoCV\whatsapp_icon.ico"
    page.theme_mode = ft.ThemeMode.LIGHT
    page.window.alignment = ft.alignment.center
    page.window.shadow = True

    # -------------------- Inicializa Componentes de Áudio --------------------
    # Som jazz de fundo com volume controlado via slider
    jazz_audio = fta.Audio(src=JAZZ_URL, autoplay=True)
    jazz_audio.volume = 0.3  # valor inicial de volume (0 a 1)

    crescendo_audio = fta.Audio(src=CRESCENDO_URL, autoplay=False)
    clique_audio = fta.Audio(src=CLIQUE_URL, autoplay=False)
    negativo_audio = fta.Audio(src=NEGATIVO_URL, autoplay=False)
    afirmativo_audio = fta.Audio(src=AFIRMATIVO_URL, autoplay=False)
    
    page.overlay.extend([
        jazz_audio, crescendo_audio, clique_audio, negativo_audio, afirmativo_audio
    ])
    page.theme_mode = ft.ThemeMode.DARK
    page.frameless=True

    # -------------------- Splash Screen com Animação Rive --------------------
    # Usando o componente fr.Rive com placeholder, conforme a implementação correta.
    splash = ft.Column(
        controls=[
            fr.Rive(
                src="Animation - 1742794320756.json",  # Certifique-se de que o arquivo esteja no formato .riv e na pasta assets
                placeholder=ft.ProgressBar(),
                width=1500,
                height=1000
            )
        ],
        alignment=ft.alignment.center
    )
    frameless=True
    page.controls.clear()
    page.add(splash)
    page.update()


    # Transição para a interface principal após 4 segundos
    def show_main_interface():
        page.theme_mode = ft.ThemeMode.LIGHT
        page.controls.clear()
        page.add(
            ft.Row([theme_toggle], alignment=ft.alignment.top_left),
            ft.Column(
                [
                    ft.Text("Whatsbot.py", size=24, weight="bold"),
                    numero_field,
                    mensagem_field,
                    ft.Row(
                        [
                            selecionar_pdf_button,
                            hotkey_field,
                            ft.ElevatedButton("Configurar Hotkey", on_click=configurar_hotkey_click)
                        ],
                        alignment=ft.MainAxisAlignment.CENTER,
                        spacing=10
                    ),
                    ft.Row([enviar_button, parar_button, historico_button], alignment=ft.MainAxisAlignment.CENTER, spacing=10),
                    progress_bar,
                    progress_text,
                    status_text,
                    ft.Text("Volume:", size=10),
                    slider_jazz_volume
                ],
                alignment=ft.MainAxisAlignment.CENTER,
                horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                spacing=15
            )
        )
        page.update()

    threading.Timer(6.0, show_main_interface).start()

    # -------------------- Inicia o Áudio de Fundo --------------------
    def iniciar_background():
        play_sound(crescendo_audio)
        time.sleep(1.5)
        play_sound(jazz_audio)
    threading.Thread(target=iniciar_background, daemon=True).start()

    # -------------------- Handlers e Widgets da Interface Principal --------------------
    def progress_callback(message: str):
        if "%" in message:
            try:
                valor = int(message.split("%")[0]) / 100
                progress_bar.value = valor
                progress_text.value = message
            except Exception:
                status_text.value = message
        else:
            status_text.value = message
        page.update()

    def finish_callback():
        progress_callback("Envio finalizado.")

    def file_picker_result(e: ft.FilePickerResultEvent):
        if e.files:
            arquivo = e.files[0]
            arquivo_pdf_path["path"] = arquivo.path
            arquivo_pdf_path["name"] = os.path.basename(arquivo.path)
            status_text.value = f"Arquivo selecionado: {arquivo_pdf_path['name']}"
        else:
            status_text.value = "Nenhum arquivo selecionado."
        page.update()

    file_picker = ft.FilePicker(on_result=file_picker_result)
    page.overlay.append(file_picker)

    def selecionar_pdf_click(e):
        play_sound(clique_audio)
        file_picker.pick_files(allow_multiple=False, file_type="pdf")

    def enviar_click(e):
        play_sound(afirmativo_audio)
        nonlocal envio_thread
        reset_cancelamento()
        numeros_str = numero_field.value
        mensagem = mensagem_field.value

        if not numeros_str or not mensagem:
            status_text.value = "Por favor, insira números e mensagem."
            play_sound(negativo_audio)
            page.update()
            return

        if not arquivo_pdf_path["name"]:
            status_text.value = "Por favor, selecione um arquivo PDF."
            play_sound(negativo_audio)
            page.update()
            return

        numeros = [num.strip() for num in numeros_str.split(",") if num.strip()]
        progress_bar.value = 0
        progress_text.value = "0% Concluído"
        status_text.value = "Iniciando envio..."
        page.update()

        envio_thread = EnvioThread(numeros, mensagem, arquivo_pdf_path["name"], progress_callback, finish_callback)
        envio_thread.start()

    def parar_click(e):
        play_sound(negativo_audio)
        nonlocal envio_thread
        if envio_thread and envio_thread.is_alive():
            envio_thread.parar()
            progress_callback("Envio cancelado pelo usuário.")
        else:
            progress_callback("Nenhum envio em progresso.")

    def mostrar_historico(e):
        play_sound(clique_audio)
        conteudo = ""
        arquivo = "historico_envios.csv"
        if not os.path.exists(arquivo):
            conteudo = "Nenhum histórico encontrado."
        else:
            with open(arquivo, "r", encoding="utf-8") as arq:
                conteudo = arq.read()
        historico_dialog.content.value = conteudo
        historico_dialog.open = True
        page.update()

    historico_dialog = ft.AlertDialog(
        title=ft.Text("Histórico de Envios"),
        content=ft.Text(value=""),
        actions=[ft.TextButton("Fechar", on_click=lambda e: close_dialog())],
        actions_alignment=ft.MainAxisAlignment.END
    )
    def close_dialog():
        historico_dialog.open = False
        page.update()
    page.dialog = historico_dialog

    def configurar_hotkey_click(e):
        global current_hotkey
        novo = hotkey_field.value if hotkey_field.value else "p"
        current_hotkey = novo
        status_text.value = f"Hotkey configurada para '{current_hotkey}'"
        page.update()

    def toggle_theme(e):
        play_sound(clique_audio)
        page.theme_mode = ft.ThemeMode.DARK if page.theme_mode == ft.ThemeMode.LIGHT else ft.ThemeMode.LIGHT
        page.update()

    def on_keyboard_event(e: ft.KeyboardEvent):
        if e.key.lower() == current_hotkey.lower():
            parar_envio()
            progress_callback("Envio cancelado via hotkey.")
    page.on_keyboard_event = on_keyboard_event

    # -------------------- Widgets da Interface Principal --------------------
    theme_toggle = ft.IconButton(
        icon=ft.Icons.BRIGHTNESS_6,
        tooltip="Alternar tema",
        on_click=toggle_theme
    )

    numero_field = ft.TextField(
        label="Números (com DDD) e cargo (opcional):",
        hint_text="Ex: (61) 99156-7380 - Cargo, (61) 98765-4321 - Outro Cargo",
        width=350
    )

    mensagem_field = ft.TextField(
        label="Mensagem a ser enviada:",
        hint_text=f"{get_saudacao()}, estou enviando meu currículo sobre a vaga de interesse. Desde já, agradeço a atenção.",
        width=350
    )

    hotkey_field = ft.TextField(
        label="Hotkey:",
        hint_text="Ex: P",
        width=100,
        value="P"
    )

    enviar_button = ft.ElevatedButton("Enviar Currículo", on_click=enviar_click, width=150)
    parar_button = ft.ElevatedButton("Parar Envio", on_click=parar_click, width=150, bgcolor=ft.Colors.RED)
    historico_button = ft.ElevatedButton("Ver Histórico", on_click=mostrar_historico, width=150)
    selecionar_pdf_button = ft.ElevatedButton("Selecionar PDF", on_click=selecionar_pdf_click, width=150)

    progress_bar = ft.ProgressBar(width=350, value=0)
    progress_text = ft.Text(value="0% Concluído")
    status_text = ft.Text(value="Status: aguardando ação...", size=14)

    # Slider para controle do volume do som jazz (valor entre 0 e 1)
    slider_jazz_volume = ft.Slider(
        min=0,
        max=1,
        value=jazz_audio.volume,
        divisions=20,
        label="{value}",
        on_change=lambda e: change_jazz_volume(e, jazz_audio, page)
    )

    def change_jazz_volume(e, audio_component, page_obj):
        audio_component.volume = e.control.value
        page_obj.update()

    arquivo_pdf_path = {"name": None, "path": None}
    envio_thread = None

ft.app(target=main, assets_dir="assets")
