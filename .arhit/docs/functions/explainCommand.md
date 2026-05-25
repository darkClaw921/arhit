# explainCommand

Команда 'arhit explain <element>': агрегированная карточка элемента в один вызов — путь:строка, сигнатура, exports, дочерние элементы, что вызывает (calls по точному fromElement), кто зависит (dependents по точному toElement) и документация. Заменяет связку arch show + deps + calls + doc show, экономя токены и раунд-трипы агента.
