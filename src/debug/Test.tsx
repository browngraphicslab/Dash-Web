import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { serialize, deserialize, map } from 'serializr';
import { URLField, Doc } from '../fields/NewDoc';

class Test extends React.Component {
    onClick = () => {
        const url = new URLField(new URL("http://google.com"));
        const doc = new Doc("a");
        const doc2 = new Doc("b");
        doc.hello = 5;
        doc.fields = "test";
        doc.test = "hello doc";
        doc.url = url;
        doc.testDoc = doc2;

        console.log(doc.hello);
        console.log(doc.fields);
        console.log(doc.test);
        console.log(doc.url);
        console.log(doc.testDoc);
    }

    render() {
        return <button onClick={this.onClick}>Click me</button>;
    }
}

ReactDOM.render(
    <Test />,
    document.getElementById('root')
);