import { action, observable, computed } from "mobx";
import { observer } from "mobx-react";
import { DocumentView } from "../nodes/DocumentView";
import { LinkEditor } from "./LinkEditor";
import './LinkMenu.scss';
import React = require("react");
import { Doc } from "../../../fields/Doc";
import { LinkManager } from "../../util/LinkManager";
import { LinkMenuGroup } from "./LinkMenuGroup";
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import { library } from "@fortawesome/fontawesome-svg-core";
import { DocumentLinksButton } from "../nodes/DocumentLinksButton";
import { LinkDocPreview } from "../nodes/LinkDocPreview";

library.add(faTrash);

interface Props {
    docView: DocumentView;
    changeFlyout: () => void;
    addDocTab: (document: Doc, where: string) => boolean;
}

@observer
export class LinkMenu extends React.Component<Props> {

    @observable private _editingLink?: Doc;
    @observable private _linkMenuRef = React.createRef<HTMLDivElement>();
    private _editorRef = React.createRef<HTMLDivElement>();

    //@observable private _numLinks: number = 0;

    // @computed get overflow() {
    //     if (this._numLinks) {
    //         return "scroll";
    //     }
    //     return "auto";
    // }

    @action
    onClick = (e: PointerEvent) => {

        LinkDocPreview.LinkInfo = undefined;


        if (this._linkMenuRef && !this._linkMenuRef.current?.contains(e.target as any)) {
            if (this._editorRef && !this._editorRef.current?.contains(e.target as any)) {
                DocumentLinksButton.EditLink = undefined;
            }
        }
    }
    @action
    componentDidMount() {
        this._editingLink = undefined;
        document.addEventListener("pointerdown", this.onClick);
    }

    componentWillUnmount() {
        document.removeEventListener("pointerdown", this.onClick);
    }

    clearAllLinks = () => {
        LinkManager.Instance.deleteAllLinksOnAnchor(this.props.docView.props.Document);
    }

    renderAllGroups = (groups: Map<string, Array<Doc>>): Array<JSX.Element> => {
        const linkItems: Array<JSX.Element> = [];
        groups.forEach((group, groupType) => {
            linkItems.push(
                <LinkMenuGroup
                    key={groupType}
                    docView={this.props.docView}
                    sourceDoc={this.props.docView.props.Document}
                    group={group}
                    groupType={groupType}
                    showEditor={action((linkDoc: Doc) => this._editingLink = linkDoc)}
                    addDocTab={this.props.addDocTab} />
            );
        });

        // if source doc has no links push message
        if (linkItems.length === 0) linkItems.push(<p key="">No links have been created yet. Drag the linking button onto another document to create a link.</p>);

        return linkItems;
    }

    @computed
    get position() {
        const docView = this.props.docView;
        const transform = (docView.props.ScreenToLocalTransform().scale(docView.props.ContentScaling())).inverse();
        const [sptX, sptY] = transform.transformPoint(0, 0);
        const [bptX, bptY] = transform.transformPoint(docView.props.PanelWidth(), docView.props.PanelHeight());
        return { x: sptX, y: sptY, r: bptX, b: bptY };
    }

    render() {
        console.log("computed", this.position.x, this.position.b);
        const sourceDoc = this.props.docView.props.Document;
        const groups: Map<string, Doc[]> = LinkManager.Instance.getRelatedGroupedLinks(sourceDoc);
        return <div className="linkMenu" ref={this._linkMenuRef} >
            {!this._editingLink ?
                <div className="linkMenu-list" style={{ left: this.position.x, top: this.position.b + 15 }}>
                    {this.renderAllGroups(groups)}
                </div> :
                <div className="linkMenu-listEditor" style={{ left: this.position.x, top: this.position.b + 15 }}>
                    <LinkEditor sourceDoc={this.props.docView.props.Document} linkDoc={this._editingLink}
                        showLinks={action(() => this._editingLink = undefined)} />
                </div>
            }

        </div>;
    }
}