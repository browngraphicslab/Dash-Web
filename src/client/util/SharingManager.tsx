import { observable, runInAction, action, autorun } from "mobx";
import * as React from "react";
import MainViewModal from "../views/MainViewModal";
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";
import { DocServer } from "../DocServer";
import { Cast, StrCast, NumCast } from "../../new_fields/Types";
import { listSpec } from "../../new_fields/Schema";
import { List } from "../../new_fields/List";
import { RouteStore } from "../../server/RouteStore";
import * as RequestPromise from "request-promise";
import { Utils } from "../../Utils";
import "./SharingManager.scss";
import { Id, SetAcls, GetAcls, Public } from "../../new_fields/FieldSymbols";
import { observer } from "mobx-react";
import { MainView } from "../views/MainView";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from '@fortawesome/fontawesome-svg-core';
import * as fa from '@fortawesome/free-solid-svg-icons';
import { DocumentView } from "../views/nodes/DocumentView";
import { SelectionManager } from "./SelectionManager";
import { DocumentManager } from "./DocumentManager";
import { CollectionVideoView } from "../views/collections/CollectionVideoView";
import { CollectionPDFView } from "../views/collections/CollectionPDFView";
import { CollectionView } from "../views/collections/CollectionView";
import { Doc, Opt } from "../../new_fields/Doc";

library.add(fa.faCopy);

export interface User {
    email: string;
    userDocumentId: string;
}

const ColorMapping = new Map<number, string>([
    [3, "red"],
    [0, "maroon"],
    [2, "blue"],
    [1, "green"]
]);

const DefaultColor = "black";

export namespace Permissions {
    export const toString = new Map<number, string>([
        [0, "Can Read"],
        [1, "Can Write"],
        [2, "Can Only Add"],
        [3, "Not Shared"]
    ]);

    export const fromString = new Map<string, number>([
        ["Can Read", 0],
        ["Can Write", 1],
        ["Can Only Add", 2],
        ["Not Shared", 3]
    ]);
}

@observer
export default class SharingManager extends React.Component<{}> {
    public static Instance: SharingManager;
    @observable private isOpen = false;
    @observable private users: User[] = [];
    @observable private targetDoc: Doc | undefined;
    @observable private targetDocView: DocumentView | undefined;
    @observable private copied = false;
    @observable private dialogueBoxOpacity = 1;
    @observable private overlayOpacity = 0.4;

    public open = (target: DocumentView) => {
        SelectionManager.DeselectAll();
        this.populateUsers().then(action(() => {
            this.targetDocView = target;
            this.targetDoc = target.props.Document;
            MainView.Instance.hasActiveModal = true;
            this.isOpen = true;
        }));
    }

    public close = action(() => {
        this.isOpen = false;
        setTimeout(action(() => {
            this.copied = false;
            MainView.Instance.hasActiveModal = false;
            this.targetDoc = undefined;
        }), 500);
    });

    constructor(props: {}) {
        super(props);
        SharingManager.Instance = this;
        autorun(() => this.targetDoc && console.log("PUBLIC PERMISSIONS: ", this.targetDoc[GetAcls]()[Public]["*"]));
    }

    populateUsers = async () => {
        let userList = await RequestPromise.get(Utils.prepend(RouteStore.getUsers));
        runInAction(() => {
            this.users = (JSON.parse(userList) as User[]).filter(({ email }) => email !== CurrentUserUtils.email);
        });
    }

    setInternalSharing = async (user: User, permission: number) => {
        const userDocument = await DocServer.GetRefField(user.userDocumentId);
        if (!(userDocument instanceof Doc)) {
            console.log(`Couldn't get user document of user ${user.email}`);
            return;
        }
        let target = this.targetDoc;
        if (!target) {
            console.log("SharingManager trying to share an undefined document!!");
            return;
        }
        const notifDoc = await Cast(userDocument.optionalRightCollection, Doc);
        if (notifDoc instanceof Doc) {
            const data = await Cast(notifDoc.data, listSpec(Doc));
            if (!data) {
                console.log("UNABLE TO ACCESS NOTIFICATION DATA");
                return;
            }
            console.log(`Attempting to set permissions to ${permission} for the document ${target[Id]}`);
            if (permission !== 3) {
                const sharedDoc = Doc.MakeAlias(target);
                if (sharedDoc.proto) {
                    sharedDoc.proto[SetAcls](user.userDocumentId, permission);
                }
                sharedDoc[SetAcls](user.userDocumentId, permission);
                if (data) {
                    data.push(sharedDoc);
                } else {
                    notifDoc.data = new List([sharedDoc]);
                }
            } else {
                let dataDocs = (await Promise.all(data.map(doc => doc))).map(doc => Doc.GetProto(doc));
                if (dataDocs.includes(target)) {
                    console.log("Searching in ", dataDocs, "for", target);
                    dataDocs.splice(dataDocs.indexOf(target), 1);
                    console.log("SUCCESSFULLY UNSHARED DOC");
                } else {
                    console.log("DIDN'T THINK WE HAD IT, SO NOT SUCCESSFULLY UNSHARED");
                }
            }
        }
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
        return [3, 0, 2, 1].map((ordinal: number) => {
            return (
                <option key={ordinal} value={ordinal}>
                    {Permissions.toString.get(ordinal)}
                </option>
            );
        });
    }

    private focusOn = (contents: string) => {
        let title = this.targetDoc ? StrCast(this.targetDoc.title) : "";
        return (
            <span
                title={title}
                onClick={() => {
                    let context: Opt<CollectionVideoView | CollectionPDFView | CollectionView>;
                    if (this.targetDoc && this.targetDocView && (context = this.targetDocView.props.ContainingCollectionView)) {
                        DocumentManager.Instance.jumpToDocument(this.targetDoc, true, undefined, undefined, undefined, context.props.Document);
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

    private get linkVisible() {
        return this.publicPermissions !== 3;
    }

    private get publicPermissions() {
        return this.targetDoc ? NumCast(this.targetDoc[GetAcls]()[Public]["*"], 3) : 3;
    }

    private set publicPermissions(permissions: number) {
        runInAction(() => {
            if (this.targetDoc) {
                [this.targetDoc, Doc.GetProto(this.targetDoc)].forEach(doc => doc[SetAcls](Public, permissions));
            }
        });
    }

    private get publicPermissionsColor() {
        return this.targetDoc ? ColorMapping.get(this.publicPermissions) : DefaultColor;
    }

    private get sharingInterface() {
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
                        value={this.publicPermissions}
                        style={{
                            marginLeft: this.linkVisible ? 10 : 0,
                            color: this.publicPermissionsColor,
                            borderColor: this.publicPermissionsColor
                        }}
                        onChange={e => this.publicPermissions = Number(e.currentTarget.value)}
                    >
                        {this.sharingOptions}
                    </select>
                </div>
                <div className={"hr-substitute"} />
                <p className={"share-individual"}>Privately share {this.focusOn("this document")} with an individual...</p>
                <div className={"users-list"} style={{ display: this.users.length ? "block" : "flex" }}>
                    {!this.users.length ? "There are no other users in your database." :
                        this.users.map(user => {
                            let userColor = this.targetDoc ? ColorMapping.get(NumCast(this.targetDoc[GetAcls]()[user.userDocumentId], 3)) : DefaultColor;
                            return (
                                <div
                                    key={user.email}
                                    className={"container"}
                                >
                                    <select
                                        className={"permissions-dropdown"}
                                        value={this.targetDoc ? NumCast(this.targetDoc[GetAcls]()[user.userDocumentId], 3) : 3}
                                        style={{
                                            color: userColor,
                                            borderColor: userColor
                                        }}
                                        onChange={e => this.setInternalSharing(user, Number(e.currentTarget.value) || 3)}
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