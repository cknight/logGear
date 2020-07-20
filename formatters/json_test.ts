import {
  test,
  assertEquals,
  assertThrows,
  assertMatch,
} from "../test_deps.ts";
import { Level } from "../logger/levels.ts";
import { JsonFormatter } from "./json.ts";
import { PropertyRedaction } from "../obfuscators/propertyRedaction.ts";
import { LogRecord } from "../types.ts";
import { SimpleDateTimeFormatter } from "./simpleDateTimeFormatter.ts";

test({
  name: "Test default JSON formatting",
  fn() {
    const lr = {
      msg: { a: 6, b: "hello" },
      metadata: [true, undefined, "there"],
      dateTime: new Date(1592360640000), // "2020-06-17T03:24:00"
      level: Level.DEBUG,
      logger: "default",
    };
    const jf = new JsonFormatter();
    assertEquals(
      jf.format(lr),
      '{"dateTime":"2020-06-17T02:24:00.000Z","level":"DEBUG","msg":{"a":6,"b":"hello"},"metadata":[true,null,"there"]}',
    );
  },
});

test({
  name: "JSON formatting can be controlled at a field level",
  fn() {
    const lr = {
      msg: { a: 6, b: "hello" },
      metadata: [true, undefined, "there"],
      dateTime: new Date(1592360640000), // "2020-06-17T03:24:00"
      level: Level.DEBUG,
      logger: "default",
    };
    const jfMsg = new JsonFormatter().withFields(["msg"]);
    const jfDateTime = new JsonFormatter().withFields(["dateTime"]);
    const jfLevel = new JsonFormatter().withFields(["level"]);
    const jfMetadata = new JsonFormatter().withFields(["metadata"]);
    const jfMsgDateTime = new JsonFormatter().withFields(
      ["dateTime", "msg", "logger"],
    );
    assertEquals(jfMsg.format(lr), '{"msg":{"a":6,"b":"hello"}}');
    assertEquals(
      jfDateTime.format(lr),
      '{"dateTime":"2020-06-17T02:24:00.000Z"}',
    );
    assertEquals(jfLevel.format(lr), '{"level":"DEBUG"}');
    assertEquals(jfMetadata.format(lr), '{"metadata":[true,null,"there"]}');
    assertEquals(
      jfMsgDateTime.format(lr),
      '{"dateTime":"2020-06-17T02:24:00.000Z","msg":{"a":6,"b":"hello"},"logger":"default"}',
    );
  },
});

test({
  name: "Empty field array throws Error",
  fn() {
    assertThrows(() => {
      new JsonFormatter().withFields([]);
    });
  },
});

test({
  name: "Pretty printing is supported",
  fn() {
    const lr = {
      msg: { a: 6, b: "hello" },
      metadata: [true, undefined, "there"],
      dateTime: new Date(1592360640000), // "2020-06-17T03:24:00"
      level: Level.DEBUG,
      logger: "default",
    };
    const jf = new JsonFormatter().withPrettyPrintIndentation(2);
    const jfStar = new JsonFormatter().withPrettyPrintIndentation("**");
    const newLrA = new PropertyRedaction("ljh").obfuscate(
      { handle(lR: LogRecord): void {} },
      lr,
    );
    assertEquals(
      jf.format(newLrA),
      '{\n  "dateTime": "2020-06-17T02:24:00.000Z",\n  "level": "DEBUG",\n  "msg": {\n    "a": 6,\n    "b": "hello"\n  },\n  "metadata": [\n    true,\n    null,\n    "there"\n  ]\n}',
    );
    assertEquals(
      jfStar.format(newLrA),
      '{\n**"dateTime": "2020-06-17T02:24:00.000Z",\n**"level": "DEBUG",\n**"msg": {\n****"a": 6,\n****"b": "hello"\n**},\n**"metadata": [\n****true,\n****null,\n****"there"\n**]\n}',
    );
  },
});

test({
  name: "DateTimeFormatter is supported",
  fn() {
    const lr = {
      msg: "hello",
      metadata: [],
      dateTime: new Date(1592360640000), // "2020-06-17T03:24:00"
      level: Level.DEBUG,
      logger: "default",
    };
    const jf = new JsonFormatter().withDateTimeFormat(
      new SimpleDateTimeFormatter("hh:mm dddd MMM D"),
    );

    assertMatch(
      jf.format(lr),
      /{\"dateTime\":\"0\d:24 Wednesday Jun 17\",\"level\":\"DEBUG\",\"msg\":\"hello\",\"metadata\":\[\]}/,
    );
    // assertEquals(
    //   jf.format(lr),
    //   '{\"dateTime\":\"03:24 Wednesday Jun 17\",\"level\":\"DEBUG\",\"msg\":\"hello\",\"metadata\":[]}',
    // );
  },
});
