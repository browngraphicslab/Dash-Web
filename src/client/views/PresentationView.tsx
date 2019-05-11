import { observer } from "mobx-react";
import React = require("react")
import { observable, action, runInAction, reaction } from "mobx";
import "./PresentationView.scss"
import "./Main.tsx";
import { DocumentManager } from "../util/DocumentManager";
import { Utils } from "../../Utils";
import { Doc } from "../../new_fields/Doc";
import { listSpec } from "../../new_fields/Schema";
import { Cast, NumCast, FieldValue, PromiseValue } from "../../new_fields/Types";
import { Id } from "../../new_fields/RefField";
import { List } from "../../new_fields/List";
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";

export interface PresViewProps {
    //Document: Doc;
}


@observer
/**
 * Component that takes in a document prop and a boolean whether it's collapsed or not.
 */
class PresentationViewItem extends React.Component<PresViewProps> {

    @observable Document: Doc;
    constructor(props: PresViewProps) {
        super(props);
        this.Document = FieldValue(Cast(FieldValue(Cast(CurrentUserUtils.UserDocument.activeWorkspace, Doc))!.presentationView, Doc))!;
    }
    //look at CollectionFreeformView.focusDocument(d)
    @action
    openDoc = (doc: Doc) => {
        let docView = DocumentManager.Instance.getDocumentView(doc);
        if (docView) {
            docView.props.focus(docView.props.Document);
        }
    }

    /**
  * Removes a document from the presentation view
  **/
    @action
    public RemoveDoc(doc: Doc) {
        const value = Cast(this.Document.data, listSpec(Doc), []);
        let index = -1;
        for (let i = 0; i < value.length; i++) {
            if (value[i][Id] === doc[Id]) {
                index = i;
                break;
            }
        }
        if (index !== -1) {
            value.splice(index, 1);
        }
    }

    /**
     * Renders a single child document. It will just append a list element.
     * @param document The document to render.
     */
    renderChild(document: Doc) {
        let title = document.title;

        //to get currently selected presentation doc
        let selected = NumCast(this.Document.selectedDoc, 0);

        // finally, if it's a normal document, then render it as such.
        const children = Cast(this.Document.data, listSpec(Doc));
        const styles: any = {};
        if (children && children[selected] === document) {
            //this doc is selected
            styles.background = "gray";
        }
        return (
            <li className="presentationView-item" style={styles} key={Utils.GenerateGuid()}>
                <div className="presentationView-header" onClick={() => this.openDoc(document)}>{title}</div>
                <div className="presentation-icon" onClick={() => this.RemoveDoc(document)}>X</div>
            </li>
        );

    }

    render() {
        const children = Cast(this.Document.data, listSpec(Doc), []);

        return (
            <div>
                {children.map(value => this.renderChild(value))}
            </div>
        );
    }
}


@observer
export class PresentationView extends React.Component<PresViewProps>  {
    public static Instance: PresentationView;

    //observable means render is re-called every time variable is changed
    @observable
    collapsed: boolean = false;
    closePresentation = action(() => this.Document!.width = 0);
    next = () => {
        const current = NumCast(this.Document!.selectedDoc);
        const allDocs = FieldValue(Cast(this.Document!.data, listSpec(Doc)));
        if (allDocs && current < allDocs.length + 1) {
            //can move forwards
            this.Document!.selectedDoc = current + 1;
            const doc = allDocs[current + 1];
            let docView = DocumentManager.Instance.getDocumentView(doc);
            if (docView) {
                docView.props.focus(docView.props.Document);
            }
        }

    }
    back = () => {
        const current = NumCast(this.Document!.selectedDoc);
        const allDocs = FieldValue(Cast(this.Document!.data, listSpec(Doc)));
        if (allDocs && current - 1 >= 0) {
            //can move forwards
            this.Document!.selectedDoc = current - 1;
            const doc = allDocs[current - 1];
            let docView = DocumentManager.Instance.getDocumentView(doc);
            if (docView) {
                docView.props.focus(docView.props.Document);
            }
        }
    }

    private ref = React.createRef<HTMLDivElement>();

    @observable Document?: Doc;
    //initilize class variables
    constructor(props: PresViewProps) {
        super(props);
        let self = this;
        reaction(() =>
            CurrentUserUtils.UserDocument.activeWorkspace,
            (activeW) => {
                if (activeW && activeW instanceof Doc) {
                    PromiseValue(Cast(activeW.presentationView, Doc)).
                        then(pv => runInAction(() => {
                            if (pv) self.Document = pv;
                            else {
                                pv = new Doc();
                                pv.title = "Presentation Doc";
                                activeW.presentationView = pv;
                                self.Document = pv;
                            }
                        }))
                }
            },
            { fireImmediately: true });
        PresentationView.Instance = this;
    }

    /**
     * Adds a document to the presentation view
     **/
    @action
    public PinDoc(doc: Doc) {
        //add this new doc to props.Document
        const data = Cast(this.Document!.data, listSpec(Doc));
        if (data) {
            data.push(doc);
        } else {
            this.Document!.data = new List([doc]);
        }

        this.Document!.width = 300;
    }

    render() {
        if (!this.Document)
            return (null);
        let titleStr = this.Document.Title;
        let width = NumCast(this.Document.width);

        //TODO: next and back should be icons
        return (
            <div className="presentationView-cont" style={{ width: width, overflow: "hidden" }}>
                <div className="presentationView-heading">
                    <div className="presentationView-title">{titleStr}</div>
                    <div className='presentation-icon' onClick={this.closePresentation}>X</div></div>
                <div>
                    <div className="presentation-back" onClick={this.back}>back</div>
                    <div className="presentation-next" onClick={this.next}>next</div>

                </div>
                <ul>
                    <PresentationViewItem />
                </ul>
            </div>
        );
    }
}