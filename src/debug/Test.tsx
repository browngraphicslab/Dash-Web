import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { serialize, deserialize, map } from 'serializr';
import { URLField, Doc, createSchema, makeInterface, makeStrictInterface } from '../fields/NewDoc';
import { SerializationHelper } from '../client/util/SerializationHelper';

const schema1 = createSchema({
    hello: "number",
    test: "string",
    fields: "boolean",
    url: URLField,
    testDoc: Doc
});

const TestDoc = makeInterface(schema1);
type TestDoc = makeInterface<typeof schema1>;

const schema2 = createSchema({
    hello: URLField,
    test: "boolean",
    fields: "string",
    url: "number",
    testDoc: URLField
});

const Test2Doc = makeStrictInterface(schema2);
type Test2Doc = makeStrictInterface<typeof schema2>;

const assert = (bool: boolean) => {
    if (!bool) throw new Error();
};

class Test extends React.Component {
    onClick = () => {
        const url = new URLField(new URL("http://google.com"));
        const doc = new Doc();
        const doc2 = new Doc();
        doc.hello = 5;
        doc.fields = "test";
        doc.test = "hello doc";
        doc.url = url;
        doc.testDoc = doc2;


        const test1: TestDoc = TestDoc(doc);
        const test2: Test2Doc = Test2Doc(doc);
        assert(test1.hello === 5);
        assert(test1.fields === undefined);
        assert(test1.test === "hello doc");
        assert(test1.url === url);
        assert(test1.testDoc === doc2);
        test1.myField = 20;
        assert(test1.myField === 20);

        assert(test2.hello === undefined);
        assert(test2.fields === "test");
        assert(test2.test === undefined);
        assert(test2.url === undefined);
        assert(test2.testDoc === undefined);
        test2.url = 35;
        assert(test2.url === 35);
    }

    render() {
        return <button onClick={this.onClick}>Click me</button>;
    }
}

ReactDOM.render(
    <Test />,
    document.getElementById('root')
);