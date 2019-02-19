import { action, configure } from 'mobx';
import "normalize.css";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { DocumentDecorations } from './DocumentDecorations';
import { Documents } from '../documents/Documents';
import { Document } from '../../fields/Document';
import { KeyStore, KeyStore as KS } from '../../fields/Key';
import { ListField } from '../../fields/ListField';
import { NumberField } from '../../fields/NumberField';
import { TextField } from '../../fields/TextField';
import "./Main.scss";
import { ContextMenu } from './ContextMenu';
import { DocumentView } from './nodes/DocumentView';
import { ImageField } from '../../fields/ImageField';
import { Transform } from '../util/Transform';


configure({
    enforceActions: "observed"
});

const mainNodeCollection = new Array<Document>();
let mainContainer = Documents.DockDocument(mainNodeCollection, {
    x: 0, y: 0, title: "main container"
})

window.addEventListener("drop", function (e) {
    e.preventDefault();
}, false)
window.addEventListener("dragover", function (e) {
    e.preventDefault();
}, false)
document.addEventListener("pointerdown", action(function (e: PointerEvent) {
    if (!ContextMenu.Instance.intersects(e.pageX, e.pageY)) {
        ContextMenu.Instance.clearItems()
    }
}), true)


//runInAction(() => 
{
    let doc1 = Documents.TextDocument({ title: "hello", width: 400, height: 300 });
    let doc2 = doc1.MakeDelegate();
    doc2.Set(KS.X, new NumberField(150));
    doc2.Set(KS.Y, new NumberField(20));
    let doc3 = Documents.ImageDocument("https://psmag.com/.image/t_share/MTMyNzc2NzM1MDY1MjgzMDM4/shutterstock_151341212jpg.jpg", {
        x: 450, y: 100, title: "dog", width: 606, height: 386, nativeWidth: 606, nativeHeight: 386
    });
    //doc3.Set(KeyStore.Data, new ImageField);
    const schemaDocs = Array.from(Array(5).keys()).map(v => Documents.ImageDocument("https://psmag.com/.image/t_share/MTMyNzc2NzM1MDY1MjgzMDM4/shutterstock_151341212jpg.jpg", {
        x: 50 + 100 * v, y: 50, width: 100, height: 100, title: "cat" + v, nativeWidth: 606, nativeHeight: 386
    }));
    schemaDocs.push(doc3);
    schemaDocs[0].SetData(KS.Author, "Tyler", TextField);
    schemaDocs[4].SetData(KS.Author, "Bob", TextField);
    schemaDocs.push(doc2);
    const doc7 = Documents.SchemaDocument(schemaDocs)
    const docset = [doc1, doc2, doc3, doc7];
    let doc4 = Documents.CollectionDocument(docset, {
        x: 0, y: 400, title: "mini collection"
    });
    // let doc5 = Documents.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", {
    //     x: 650, y: 500, width: 600, height: 600, title: "cat 2"
    // });
    let docset2 = [doc3, doc4, doc2];
    let doc6 = Documents.CollectionDocument(docset2, {
        x: 350, y: 100, width: 600, height: 600, title: "docking collection"
    });
    let mainNodes = mainContainer.GetOrCreate<ListField<Document>>(KeyStore.Data, ListField);
    // mainNodes.Data.push(doc6);
    // mainNodes.Data.push(doc2);
    mainNodes.Data.push(doc4);
    mainNodes.Data.push(doc3);
    // mainNodes.Data.push(doc5);
    // mainNodes.Data.push(doc1);
    // mainNodes.Data.push(doc2);
    mainNodes.Data.push(doc6);
    var layoutstr = `{"settings":{"hasHeaders":true,"constrainDragToContainer":true,"reorderEnabled":true,"selectionEnabled":true,"popoutWholeStack":false,"blockedPopoutsThrowError":true,"closePopoutsOnUnload":true,"showPopoutIcon":true,"showMaximiseIcon":true,"showCloseIcon":true,"responsiveMode":"onload","tabOverlapAllowance":0,"reorderOnTabMenuClick":true,"tabControlOffset":10},"dimensions":{"borderWidth":5,"borderGrabWidth":15,"minItemHeight":10,"minItemWidth":10,"headerHeight":20,"dragProxyWidth":300,"dragProxyHeight":200},"labels":{"close":"close","maximise":"maximise","minimise":"minimise","popout":"open in new window","popin":"pop in","tabDropdown":"additional tabs"},"content":[{"type":"row","isClosable":true,"reorderEnabled":true,"title":"","content":[{"type":"stack","width":33.333333333333336,"isClosable":true,"reorderEnabled":true,"title":"","activeItemIndex":0,"content":[{"type":"component","componentName":"documentViewComponent","componentState":{"doc":"${doc3.Id}","title":"mini collection","scaling":1},"isClosable":true,"reorderEnabled":true,"title":"documentViewComponent"}]},{"type":"stack","width":33.333333333333336,"isClosable":true,"reorderEnabled":true,"title":"","activeItemIndex":0,"content":[{"type":"component","componentName":"documentViewComponent","componentState":{"doc":"${doc6.Id}","title":"<untitled>","scaling":1},"isClosable":true,"reorderEnabled":true,"title":"documentViewComponent"}]},{"type":"stack","width":16.666666666666668,"isClosable":true,"reorderEnabled":true,"title":"","activeItemIndex":0,"content":[{"type":"component","componentName":"documentViewComponent","componentState":{"doc":"${doc4.Id}","title":"docking collection","scaling":1},"isClosable":true,"reorderEnabled":true,"title":"documentViewComponent"}]},{"type":"stack","isClosable":true,"reorderEnabled":true,"title":"","width":16.666666666666668,"activeItemIndex":0,"content":[{"type":"component","componentName":"documentViewComponent","componentState":{"doc":"${doc4.Id}","title":"hello"},"isClosable":true,"reorderEnabled":true,"title":"documentViewComponent"}]}]}],"isClosable":true,"reorderEnabled":true,"title":"","openPopouts":[],"maximisedItemId":null}`
    mainContainer.SetText(KeyStore.Data, layoutstr)
}
//}
//);

ReactDOM.render((
    <div style={{ position: "absolute", width: "100%", height: "100%" }}>
        <DocumentView Document={mainContainer}
            AddDocument={undefined} RemoveDocument={undefined} ScreenToLocalTransform={() => Transform.Identity}
            Scaling={1}
            isTopMost={true}
            ContainingCollectionView={undefined} />
        <DocumentDecorations />
        <ContextMenu />
    </div>),
    document.getElementById('root'));