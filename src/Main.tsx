import * as React from 'react';
import * as ReactDOM from 'react-dom';
import "./Main.scss";
import { NodeCollectionStore } from './stores/NodeCollectionStore';
import { RootStore } from './stores/RootStore';
import { StaticTextNodeStore } from './stores/StaticTextNodeStore';
import { VideoNodeStore } from './stores/VideoNodeStore';
import { FreeFormCanvas } from './views/freeformcanvas/FreeFormCanvas';
import { KeyController } from './controllers/KeyController';
import { NumberController } from './controllers/NumberController';


const mainNodeCollection = new NodeCollectionStore();
ReactDOM.render((
    <div>
        <h1>Dash Web</h1>
        <FreeFormCanvas store={mainNodeCollection} />
    </div>), document.getElementById('root'));



// create a bunch of text and video nodes (you probably want to delete this at some point)
let numNodes = 300;
let maxX = 10000;
let maxY = 10000;
let nodes = []
for (let i = 0; i < numNodes; i++) {
    nodes.push(new StaticTextNodeStore({ X: Math.random() * maxX, Y: Math.random() * maxY, Title: "Text Node Title", Text: "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur?" }));
}

for (let i = 0; i < 20; i++) {
    nodes.push(new VideoNodeStore({ X: Math.random() * maxX, Y: Math.random() * maxY, Title: "Video Node Title", Url: "http://cs.brown.edu/people/peichman/downloads/cted.mp4" }));
}

let test1 = new KeyController("Test"), test2 = new KeyController("Test");
let test3 = new NumberController(55);
console.log(test1 == test2);
console.log(test1 === test2);
console.log(test1.Equals(test2));
console.log(test1.Equals(test3));
mainNodeCollection.AddNodes(nodes);