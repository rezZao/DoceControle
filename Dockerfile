# API do DoceControle (C# / ASP.NET Core 10). O site (frontend) fica na Vercel; aqui roda só a API.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/DoceControle.Api/ backend/DoceControle.Api/
RUN dotnet publish backend/DoceControle.Api/DoceControle.Api.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
# em hospedagem: HTTPS atrás do proxy, sem abrir navegador, porta 10000 (padrão do Render)
ENV ASPNETCORE_URLS=http://0.0.0.0:10000 \
    Hospedagem__Local=false \
    Hospedagem__AbrirNavegador=false \
    Dados__Pasta=/var/data
EXPOSE 10000
ENTRYPOINT ["dotnet", "DoceControle.dll"]
