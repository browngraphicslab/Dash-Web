import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { serialize, deserialize, map } from 'serializr';
import { URLField, Doc, createSchema, makeInterface, makeStrictInterface, List, ListSpec } from '../fields/NewDoc';
import { SerializationHelper } from '../client/util/SerializationHelper';
import { Search } from '../server/Search';
import { restProperty } from 'babel-types';
import * as rp from 'request-promise';

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
    fields: { List: "number" } as ListSpec<number>,
    url: "number",
    testDoc: URLField
});

const Test2Doc = makeStrictInterface(schema2);
type Test2Doc = makeStrictInterface<typeof schema2>;

const schema3 = createSchema({
    test: "boolean",
});

const Test3Doc = makeStrictInterface(schema3);
type Test3Doc = makeStrictInterface<typeof schema3>;

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
        //doc.testDoc = doc2;


        // const test1: TestDoc = TestDoc(doc);
        // const test2: Test2Doc = Test2Doc(doc);
        // assert(test1.hello === 5);
        // assert(test1.fields === undefined);
        // assert(test1.test === "hello doc");
        // assert(test1.url === url);
        // //assert(test1.testDoc === doc2);
        // test1.myField = 20;
        // assert(test1.myField === 20);

        // assert(test2.hello === undefined);
        // // assert(test2.fields === "test");
        // assert(test2.test === undefined);
        // assert(test2.url === undefined);
        // assert(test2.testDoc === undefined);
        // test2.url = 35;
        // assert(test2.url === 35);
        // const l = new List<number>();
        // //TODO push, and other array functions don't go through the proxy
        // l.push(1);
        // //TODO currently length, and any other string fields will get serialized
        // l.length = 3;
        // l[2] = 5;
        // console.log(l.slice());
        // console.log(SerializationHelper.Serialize(l));
    }

    onEnter = async (e: any) => {
        var key = e.keyCode || e.which;
        if (key === 13) {
            var query = e.target.value;
            await rp.get('http://localhost:1050/search', {
                qs: {
                    query
                }
            });
        }
    }

    render() {
        return <div><button onClick={this.onClick}>Click me</button>
            <input onKeyPress={this.onEnter}></input>
        </div>;
    }
}

ReactDOM.render(
    <Test />,
    document.getElementById('root')
);