import { observable, runInAction, action } from "mobx";
import * as React from "react";
import MainViewModal from "../views/MainViewModal";
import { Doc, Opt, DocCastAsync } from "../../new_fields/Doc";
import { DocServer } from "../DocServer";
import { Cast, StrCast } from "../../new_fields/Types";
import { RouteStore } from "../../server/RouteStore";
import * as RequestPromise from "request-promise";
import { Utils } from "../../Utils";
import "./SharingManager.scss";
import { Id } from "../../new_fields/FieldSymbols";
import { observer } from "mobx-react";
import { MainView } from "../views/MainView";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from '@fortawesome/fontawesome-svg-core';
import * as fa from '@fortawesome/free-solid-svg-icons';
import { DocumentView } from "../views/nodes/DocumentView";
import { SelectionManager } from "./SelectionManager";
import { DocumentManager } from "./DocumentManager";
import { CollectionView } from "../views/collections/CollectionView";
import { DictationOverlay } from "../views/DictationOverlay";

library.add(fa.faCopy);

export interface User {
    email: string;
    userDocumentId: string;
}

export enum SharingPermissions {
    None = "Not Shared",
    View = "Can View",
    Comment = "Can Comment",
    Edit = "Can Edit"
}

const ColorMapping = new Map<string, string>([
    [SharingPermissions.None, "red"],
    [SharingPermissions.View, "maroon"],
    [SharingPermissions.Comment, "blue"],
    [SharingPermissions.Edit, "green"]
]);

const SharingKey = "sharingPermissions";
const PublicKey = "publicLinkPermissions";
const DefaultColor = "black";

interface ValidatedUser {
    user: User;
    notificationDoc: Doc;
}

const storage = "data";

@observer
export default class SharingManager extends React.Component<{}> {
    public static Instance: SharingManager;
    @observable private isOpen = false;
    @observable private users: ValidatedUser[] = [];
    @observable private targetDoc: Doc | undefined;
    @observable private targetDocView: DocumentView | undefined;
    @observable private copied = false;
    @observable private dialogueBoxOpacity = 1;
    @observable private overlayOpacity = 0.4;

    private get linkVisible() {
        return this.sharingDoc ? this.sharingDoc[PublicKey] !== SharingPermissions.None : false;
    }

    public open = (target: DocumentView) => {
        SelectionManager.DeselectAll();
        this.populateUsers().then(action(() => {
            this.targetDocView = target;
            this.targetDoc = target.props.Document;
            DictationOverlay.Instance.hasActiveModal = true;
            this.isOpen = true;
            if (!this.sharingDoc) {
                this.sharingDoc = new Doc;
            }
        }));
    }

    public close = action(() => {
        this.isOpen = false;
        this.users = [];
        setTimeout(action(() => {
            this.copied = false;
            DictationOverlay.Instance.hasActiveModal = false;
            this.targetDoc = undefined;
        }), 500);
    });

    private get sharingDoc() {
        return this.targetDoc ? Cast(this.targetDoc[SharingKey], Doc) as Doc : undefined;
    }

    private set sharingDoc(value: Doc | undefined) {
        this.targetDoc && (this.targetDoc[SharingKey] = value);
    }

    constructor(props: {}) {
        super(props);
        SharingManager.Instance = this;
    }

    populateUsers = async () => {
        let userList = await RequestPromise.get(Utils.prepend(RouteStore.getUsers));
        const raw = JSON.parse(userList) as User[];
        const evaluating = raw.map(async user => {
            let isCandidate = user.email !== Doc.CurrentUserEmail;
            if (isCandidate) {
                const userDocument = await DocServer.GetRefField(user.userDocumentId);
                if (userDocument instanceof Doc) {
                    const notificationDoc = await Cast(userDocument.optionalRightCollection, Doc);
                    runInAction(() => {
                        if (notificationDoc instanceof Doc) {
                            this.users.push({ user, notificationDoc });
                        }
                    });
                }
            }
        });
        return Promise.all(evaluating);
    }

    setInternalSharing = async (recipient: ValidatedUser, state: string) => {
        const { user, notificationDoc } = recipient;
        const target = this.targetDoc!;
        const manager = this.sharingDoc!;
        const key = user.userDocumentId;
        if (state === SharingPermissions.None) {
            const metadata = (await DocCastAsync(manager[key]));
            if (metadata) {
                let sharedAlias = (await DocCastAsync(metadata.sharedAlias))!;
                Doc.RemoveDocFromList(notificationDoc, storage, sharedAlias);
                manager[key] = undefined;
            }
        } else {
            const sharedAlias = Doc.MakeAlias(target);
            Doc.AddDocToList(notificationDoc, storage, sharedAlias);
            const metadata = new Doc;
            metadata.permissions = state;
            metadata.sharedAlias = sharedAlias;
            manager[key] = metadata;
        }
    }

    private setExternalSharing = (state: string) => {
        let sharingDoc = this.sharingDoc;
        if (!sharingDoc) {
            return;
        }
        sharingDoc[PublicKey] = state;
    }

    private get sharingUrl() {
        if (!this.targetDoc) {
            return undefined;
        }
        let baseUrl = Utils.prepend("/doc/" + this.targetDoc[Id]);
        return `${baseUrl}?sharing=true`;
    }

    copy = action(() => {
        if (this.sharingUrl) {
            Utils.CopyText(this.sharingUrl);
            this.copied = true;
        }
    });

    private get sharingOptions() {
        return Object.values(SharingPermissions).map(permission => {
            return (
                <option key={permission} value={permission}>
                    {permission}
                </option>
            );
        });
    }

    private focusOn = (contents: string) => {
        let title = this.targetDoc ? StrCast(this.targetDoc.title) : "";
        return (
            <span
                className={"focus-span"}
                title={title}
                onClick={() => {
                    let context: Opt<CollectionView>;
                    if (this.targetDoc && this.targetDocView && (context = this.targetDocView.props.ContainingCollectionView)) {
                        DocumentManager.Instance.jumpToDocument(this.targetDoc, true, undefined, context.props.Document);
                    }
                }}
                onPointerEnter={action(() => {
                    if (this.targetDoc) {
                        Doc.BrushDoc(this.targetDoc);
                        this.dialogueBoxOpacity = 0.1;
                        this.overlayOpacity = 0.1;
                    }
                })}
                onPointerLeave={action(() => {
                    this.targetDoc && Doc.UnBrushDoc(this.targetDoc);
                    this.dialogueBoxOpacity = 1;
                    this.overlayOpacity = 0.4;
                })}
            >
                {contents}
            </span>
        );
    }

    private computePermissions = (userKey: string) => {
        const sharingDoc = this.sharingDoc;
        if (!sharingDoc) {
            return SharingPermissions.None;
        }
        const metadata = sharingDoc[userKey] as Doc;
        if (!metadata) {
            return SharingPermissions.None;
        }
        return StrCast(metadata.permissions, SharingPermissions.None);
    }

    private get sharingInterface() {
        const existOtherUsers = this.users.length > 0;
        return (
            <div className={"sharing-interface"}>
                <p className={"share-link"}>Manage the public link to {this.focusOn("this document...")}</p>
                {!this.linkVisible ? (null) :
                    <div className={"link-container"}>
                        <div className={"link-box"} onClick={this.copy}>{this.sharingUrl}</div>
                        <div
                            title={"Copy link to clipboard"}
                            className={"copy"}
                            style={{ backgroundColor: this.copied ? "lawngreen" : "gainsboro" }}
                            onClick={this.copy}
                        >
                            <FontAwesomeIcon icon={fa.faCopy} />
                        </div>
                    </div>
                }
                <div className={"people-with-container"}>
                    {!this.linkVisible ? (null) : <p className={"people-with"}>People with this link</p>}
                    <select
                        className={"people-with-select"}
                        value={this.sharingDoc ? StrCast(this.sharingDoc[PublicKey], SharingPermissions.None) : SharingPermissions.None}
                        style={{
                            marginLeft: this.linkVisible ? 10 : 0,
                            color: this.sharingDoc ? ColorMapping.get(StrCast(this.sharingDoc[PublicKey], SharingPermissions.None)) : DefaultColor,
                            borderColor: this.sharingDoc ? ColorMapping.get(StrCast(this.sharingDoc[PublicKey], SharingPermissions.None)) : DefaultColor
                        }}
                        onChange={e => this.setExternalSharing(e.currentTarget.value)}
                    >
                        {this.sharingOptions}
                    </select>
                </div>
                <div className={"hr-substitute"} />
                <p className={"share-individual"}>Privately share {this.focusOn("this document")} with an individual...</p>
                <div className={"users-list"} style={{ display: existOtherUsers ? "block" : "flex", minHeight: existOtherUsers ? undefined : 200 }}>
                    {!existOtherUsers ? "There are no other users in your database." :
                        this.users.map(({ user, notificationDoc }) => {
                            const userKey = user.userDocumentId;
                            const permissions = this.computePermissions(userKey);
                            const color = ColorMapping.get(permissions);
                            return (
                                <div
                                    key={userKey}
                                    className={"container"}
                                >
                                    <select
                                        className={"permissions-dropdown"}
                                        value={permissions}
                                        style={{ color, borderColor: color }}
                                        onChange={e => this.setInternalSharing({ user, notificationDoc }, e.currentTarget.value)}
                                    >
                                        {this.sharingOptions}
                                    </select>
                                    <span className={"padding"}>{user.email}</span>
                                </div>
                            );
                        })
                    }
                </div>
                <div className={"close-button"} onClick={this.close}>Done</div>
            </div>
        );
    }

    render() {
        return (
            <MainViewModal
                contents={this.sharingInterface}
                isDisplayed={this.isOpen}
                interactive={true}
                dialogueBoxDisplayedOpacity={this.dialogueBoxOpacity}
                overlayDisplayedOpacity={this.overlayOpacity}
            />
        );
    }

}