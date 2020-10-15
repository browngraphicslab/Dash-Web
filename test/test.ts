import { expect } from 'chai';
import 'mocha';
const { JSDOM } = require('jsdom');
const dom = new JSDOM("", {
    url: `http://localhost:${resolvedPorts.server}`
});
(global as any).window = dom.window;


import { autorun, reaction } from "mobx";
import { Doc } from '../src/fields/Doc';
import { Cast } from '../src/fields/Types';
import { createSchema, makeInterface, defaultSpec } from '../src/fields/Schema';
import { ImageField } from '../src/fields/URLField';
import { resolvedPorts } from '../src/client/util/CurrentUserUtils';
describe("Document", () => {
    it('should hold fields', () => {
        const key = "Test";
        const key2 = "Test2";
        const field = 15;
        const doc = new Doc();
        doc[key] = field;
        const getField = Cast(doc[key], "number");
        const getField2 = Cast(doc[key2], "number");
        expect(getField).to.equal(field);
        expect(getField2).to.equal(undefined);
    });

    it('should update', () => {
        const doc = new Doc();
        const key = "Test";
        const key2 = "Test2";
        let ran = false;
        reaction(() => doc[key], (field) => { ran = true; });
        expect(ran).to.equal(false);

        doc[key2] = 4;
        expect(ran).to.equal(false);

        doc[key] = 5;

        expect(ran).to.equal(true);
    });
});

const testSchema1 = createSchema({
    a: "number",
    b: "string",
    c: "boolean",
    d: ImageField,
    e: Doc
});

type TestDoc = makeInterface<[typeof testSchema1]>;
const TestDoc = makeInterface(testSchema1);

const testSchema2 = createSchema({
    a: defaultSpec("boolean", true),
    b: defaultSpec("number", 5),
    c: defaultSpec("string", "hello world")
});

type TestDoc2 = makeInterface<[typeof testSchema2]>;
const TestDoc2 = makeInterface(testSchema2);

const testSchema3 = createSchema({
    a: TestDoc2
});

type TestDoc3 = makeInterface<[typeof testSchema3]>;
const TestDoc3 = makeInterface(testSchema3);

describe("Schema", () => {
    it("should do the right thing 1", () => {
        const test1 = new Doc;
        const test2 = new Doc;
        const ifield = new ImageField(new URL("http://google.com"));
        test1.a = 5;
        test1.b = "hello";
        test1.c = true;
        test1.d = ifield;
        test1.e = test2;
        const doc = TestDoc(test1);
        expect(doc.a).to.equal(5);
        expect(doc.b).to.equal("hello");
        expect(doc.c).to.equal(true);
        expect(doc.d).to.equal(ifield);
        expect(doc.e).to.equal(test2);
    });

    it("should do the right thing 2", () => {
        const test1 = new Doc;
        const test2 = new Doc;
        const ifield = new ImageField(new URL("http://google.com"));
        test1.a = "hello";
        test1.b = 5;
        test1.c = test2;
        test1.d = true;
        test1.e = ifield;
        const doc = TestDoc(test1);
        expect(doc.a).to.equal(undefined);
        expect(doc.b).to.equal(undefined);
        expect(doc.c).to.equal(undefined);
        expect(doc.d).to.equal(undefined);
        expect(doc.e).to.equal(undefined);
    });

    it("should do the right thing 3", () => {
        const test1 = new Doc;
        const test2 = new Doc;
        const ifield = new ImageField(new URL("http://google.com"));
        test1.a = "hello";
        test1.b = 5;
        test1.c = test2;
        test1.d = true;
        test1.e = ifield;
        const doc = TestDoc(test1);
        expect(doc.a).to.equal(undefined);
        expect(doc.b).to.equal(undefined);
        expect(doc.c).to.equal(undefined);
        expect(doc.d).to.equal(undefined);
        expect(doc.e).to.equal(undefined);
    });

    it("should do the right thing 4", () => {
        const doc = TestDoc2();
        expect(doc.a).to.equal(true);
        expect(doc.b).to.equal(5);
        expect(doc.c).to.equal("hello world");

        const d2 = new Doc;
        d2.a = false;
        d2.b = 4;
        d2.c = "goodbye";
        const doc2 = TestDoc2(d2);
        expect(doc2.a).to.equal(false);
        expect(doc2.b).to.equal(4);
        expect(doc2.c).to.equal("goodbye");

        const d3 = new Doc;
        d3.a = "hello";
        d3.b = false;
        d3.c = 5;
        const doc3 = TestDoc2(d3);
        expect(doc3.a).to.equal(true);
        expect(doc3.b).to.equal(5);
        expect(doc3.c).to.equal("hello world");
    });

    it("should do the right thing 5", async () => {
        const test1 = new Doc;
        const test2 = new Doc;
        const doc = TestDoc3(test1);
        expect(doc.a).to.equal(undefined);
        test1.a = test2;
        const doc2 = (await doc.a)!;
        expect(doc2.a).to.equal(true);
        expect(doc2.b).to.equal(5);
        expect(doc2.c).to.equal("hello world");
    });
});
