<#
  Gera o programa DoceControle.exe (Windows, 64 bits) na pasta dist\DoceControle.

  Uso, a partir da raiz do projeto, no PowerShell:
    .\publicar.ps1             gera o programa
    .\publicar.ps1 -Atalho     gera o programa e cria um atalho na Área de Trabalho

  Pré-requisitos: .NET SDK 10 e Node 20+. O programa gerado é autônomo: não precisa de .NET instalado.
  Versão de teste: roda só neste computador, em HTTP no localhost.
#>
param([switch]$Atalho)

$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
$saida = Join-Path $raiz 'dist\DoceControle'

function Executar([string]$descricao, [scriptblock]$comando) {
    Write-Host "==> $descricao" -ForegroundColor Cyan
    & $comando
    if ($LASTEXITCODE -ne 0) { throw "Falhou: $descricao" }
}

Executar 'Instalando o frontend' { npm --prefix "$raiz\frontend" install --no-audit --no-fund }
Executar 'Gerando o site' { npm --prefix "$raiz\frontend" run build }

if (Test-Path $saida) { Remove-Item -Recurse -Force $saida }

Executar 'Gerando o programa' {
    dotnet publish "$raiz\backend\DoceControle.Api" -c Release -r win-x64 --self-contained true `
        -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true `
        -p:DebugType=none -p:DebugSymbols=false -o $saida
}

# Arquivos que não fazem sentido no programa final.
foreach ($arquivo in 'appsettings.Development.json', 'web.config') {
    Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $saida $arquivo)
}

@'
DoceControle (versão de teste)
==============================

COMO ABRIR
  Clique duas vezes em DoceControle.exe. Uma janela preta (o servidor) e o navegador abrem sozinhos.
  Para encerrar, feche a janela preta.
  Se o Windows avisar "O Windows protegeu o computador" (o programa não é assinado, por ser de teste):
  clique em "Mais informações" e depois em "Executar assim mesmo".

ONDE FICAM OS DADOS
  Em %LOCALAPPDATA%\DoceControle (cole isso na barra do Explorador de Arquivos).
  Para começar do zero, feche o programa e apague o arquivo dococontrole.db dessa pasta.

COMO ATIVAR A IA (opcional)
  Sem chave, a IA fica desativada e o registro manual funciona normalmente.
  Crie o arquivo appsettings.Local.json na pasta de dados acima, com este conteúdo:

    { "IA": { "ChaveApi": "COLE-A-SUA-CHAVE-AQUI" } }

  Nunca compartilhe esse arquivo nem a chave.

LIMITES DESTA VERSÃO
  Só para teste, neste computador. Não substitui a orientação do médico nem calcula doses de insulina.
'@ | Set-Content -Encoding UTF8 (Join-Path $saida 'LEIA-ME.txt')

$exe = Join-Path $saida 'DoceControle.exe'
if (-not (Test-Path $exe)) { throw 'O DoceControle.exe não foi gerado.' }

if ($Atalho) {
    $atalhoCaminho = Join-Path ([Environment]::GetFolderPath('Desktop')) 'DoceControle.lnk'
    $atalhoObjeto = (New-Object -ComObject WScript.Shell).CreateShortcut($atalhoCaminho)
    $atalhoObjeto.TargetPath = $exe
    $atalhoObjeto.WorkingDirectory = $saida
    $atalhoObjeto.Description = 'DoceControle (versão de teste)'
    $atalhoObjeto.Save()
    Write-Host "Atalho criado: $atalhoCaminho" -ForegroundColor Green
}

$tamanho = [math]::Round((Get-ChildItem $saida -Recurse | Measure-Object Length -Sum).Sum / 1MB)
Write-Host ""
Write-Host "Pronto: $exe ($tamanho MB no total da pasta)" -ForegroundColor Green
