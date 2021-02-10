import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../fields/Doc";
import { LinkManager } from "../../util/LinkManager";
import { DocumentLinksButton } from "../nodes/DocumentLinksButton";
import { DocumentView, DocumentViewSharedProps } from "../nodes/DocumentView";
import { LinkDocPreview } from "../nodes/LinkDocPreview";
import { LinkEditor } from "./LinkEditor";
import './LinkMenu.scss';
import { LinkMenuGroup } from "./LinkMenuGroup";
import React = require("react");

interface Props {
    docView: DocumentView;
    changeFlyout: () => void;
}

@observer
export class LinkMenu extends React.Component<Props> {
    private _editorRef = React.createRef<HTMLDivElement>();
    @observable _editingLink?: Doc;
    @observable _linkMenuRef = React.createRef<HTMLDivElement>();

    @computed get position() {
        return ((dv) => ({ x: dv?.left || 0, y: dv?.top || 0, r: dv?.right || 0, b: dv?.bottom || 0 }))(this.props.docView.getBounds());
    }

    componentDidMount() { document.addEventListener("pointerdown", this.onPointerDown); }
    componentWillUnmount() { document.removeEventListener("pointerdown", this.onPointerDown); }

    onPointerDown = (e: PointerEvent) => {
        LinkDocPreview.Clear();
        if (!this._linkMenuRef.current?.contains(e.target as any) &&
            !this._editorRef.current?.contains(e.target as any)) {
            DocumentLinksButton.ClearLinkEditor();
        }
    }

    renderAllGroups = (groups: Map<string, Array<Doc>>): Array<JSX.Element> => {
        const linkItems = Array.from(groups.entries()).map(group =>
            <LinkMenuGroup
                key={group[0]}
                docView={this.props.docView}
                sourceDoc={this.props.docView.props.Document}
                group={group[1]}
                groupType={group[0]}
                showEditor={action(linkDoc => this._editingLink = linkDoc)} />);

        return linkItems.length ? linkItems : [<p key="">No links have been created yet. Drag the linking button onto another document to create a link.</p>];
    }

    render() {
        const sourceDoc = this.props.docView.props.Document;
        return <div className="linkMenu" ref={this._linkMenuRef}
            style={{ left: this.position.x, top: this.props.docView.topMost ? undefined : this.position.b + 15, bottom: this.props.docView.topMost ? 20 : undefined }}
        >
            {this._editingLink ?
                <div className="linkMenu-listEditor">
                    <LinkEditor sourceDoc={sourceDoc} linkDoc={this._editingLink} showLinks={action(() => this._editingLink = undefined)} />
                </div> :
                <div className="linkMenu-list" >
                    {this.renderAllGroups(LinkManager.Instance.getRelatedGroupedLinks(sourceDoc))}
                </div>}
        </div>;
    }
}