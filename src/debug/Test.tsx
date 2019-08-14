import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { DocServer } from '../client/DocServer';
import { Doc } from '../new_fields/Doc';

const protoId = "protoDoc";
const delegateId = "delegateDoc";
class Test extends React.Component {
    onCreateClick = () => {
        const proto = new Doc(protoId, true);
        const delegate = Doc.MakeDelegate(proto, delegateId);
    }

    onReadClick = async () => {
        console.log("reading");
        const docs = await DocServer.GetRefFields([delegateId, protoId]);
        console.log("done");
        console.log(docs);
    }

    onDeleteClick = () => {
        DocServer.DeleteDocuments([protoId, delegateId]);
    }

    render() {
        return (
            <div>
                <button onClick={this.onCreateClick}>Create Docs</button>
                <button onClick={this.onReadClick}>Read Docs</button>
                <button onClick={this.onDeleteClick}>Delete Docs</button>
            </div>
        );
    }
}

DocServer.init(window.location.protocol, window.location.hostname, 4321, "test", "system");
ReactDOM.render(
    <Test />,
    document.getElementById('root')
);