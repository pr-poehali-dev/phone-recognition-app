# CoinScan — Сборка APK для Android

## Что нужно установить на компьютер

1. **Node.js** — https://nodejs.org (версия 18+)
2. **Bun** — https://bun.sh (менеджер пакетов)
3. **Android Studio** — https://developer.android.com/studio
   - При установке отметить: Android SDK, Android SDK Platform, Android Virtual Device
4. **Java JDK 17** — устанавливается вместе с Android Studio (Embedded JDK)

---

## Пошаговая инструкция

### Шаг 1 — Скачай код проекта
В интерфейсе poehali.dev: **Скачать → Скачать код**
Распакуй архив в удобную папку.

### Шаг 2 — Установи зависимости
```bash
cd путь/к/проекту
bun install
```

### Шаг 3 — Собери веб-часть
```bash
bun run build
```
Появится папка `dist/` — это и есть приложение.

### Шаг 4 — Добавь Android платформу
```bash
bunx cap add android
```
Появится папка `android/` — это Android Studio проект.

### Шаг 5 — Скопируй файлы в Android
```bash
bunx cap sync android
```

### Шаг 6 — Открой в Android Studio
```bash
bunx cap open android
```
Откроется Android Studio с проектом.

### Шаг 7 — Собери APK
В Android Studio:
- Подожди пока Gradle синхронизируется (внизу будет прогресс)
- Меню: **Build → Build Bundle(s) / APK(s) → Build APK(s)**
- Готовый файл будет в: `android/app/build/outputs/apk/debug/app-debug.apk`

---

## Если используешь модель .onnx

Чтобы модель была встроена в APK и работала без интернета:
1. Положи файл модели (например `coins.onnx`) в папку:
   `android/app/src/main/assets/`
2. В приложении при выборе модели — выбери этот файл из памяти телефона,
   или доработай код чтобы грузить из assets автоматически.

---

## Установка APK на телефон

1. Включи на телефоне: **Настройки → Для разработчиков → Установка из неизвестных источников**
2. Перекинь `app-debug.apk` на телефон (через USB или облако)
3. Открой файл на телефоне и установи

---

## Частые проблемы

**"SDK not found"** — открой Android Studio → SDK Manager → установи Android 14 (API 34)

**"JAVA_HOME not set"** — в Android Studio: File → Project Structure → SDK Location → скопируй путь к JDK и пропиши в переменные окружения

**Камера не работает в APK** — это нормально для debug-сборки, нужно разрешить камеру в настройках телефона после установки
