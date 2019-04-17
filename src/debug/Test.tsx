import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { serialize, deserialize, map } from 'serializr';
import { URLField, Doc } from '../fields/NewDoc';
import { SerializationHelper } from '../client/util/SerializationHelper';

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

        console.log("doc", doc);
        const cereal = SerializationHelper.Serialize(doc);
        console.log("cereal", cereal);
        console.log("doc again", SerializationHelper.Deserialize(cereal));
    }

    render() {
        return <button onClick={this.onClick}>Click me</button>;
    }
}

ReactDOM.render(
    <Test />,
    document.getElementById('root')
);