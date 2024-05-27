import { describe, beforeAll, it, expect, afterAll } from "@jest/globals";
import { deserialize } from "class-transformer";
import type { DriveFile } from "../../../src/services/documents/entities/drive-file";
import { init, TestPlatform } from "../setup";
import { TestDbService } from "../utils.prepare.db";
import UserApi from "../common/user-api";
import {
  DriveItemDetailsMockClass,
} from "../common/entities/mock_entities";

describe("the Drive's documents' trash feature", () => {
  let platform: TestPlatform | null;
  let currentUser: UserApi;

  beforeAll(async () => {
    platform = await init({
      services: [
        "webserver",
        "database",
        "applications",
        "search",
        "storage",
        "message-queue",
        "user",
        "search",
        "files",
        "websocket",
        "messages",
        "auth",
        "realtime",
        "channels",
        "counter",
        "statistics",
        "platform-services",
        "documents",
      ],
    });
    currentUser = await UserApi.getInstance(platform);
  });

  afterAll(async () => {
    await platform?.tearDown();
    platform = null;
  });

  it("did fetch the trash", async () => {
    await TestDbService.getInstance(platform!, true);

    const response = await currentUser.getDocument("trash");
    const result = deserialize<DriveItemDetailsMockClass>(DriveItemDetailsMockClass, response.body);

    expect(result.item.id).toEqual("trash");
    expect(result.item.name).toEqual("Trash");
  });

  it("did move an item to trash", async () => {
    const createItemResult = await currentUser.createDefaultDocument();

    expect(createItemResult.id).toBeDefined();

    const moveToTrashResponse = await currentUser.delete(createItemResult.id);
    expect(moveToTrashResponse.statusCode).toEqual(200);

    const listTrashResponse = await currentUser.getDocument("trash");
    const listTrashResult = deserialize<DriveItemDetailsMockClass>(
      DriveItemDetailsMockClass,
      listTrashResponse.body,
    );
    expect(listTrashResult.item.name).toEqual("Trash");
    expect(createItemResult).toBeDefined();
    expect(createItemResult.scope).toEqual("shared");
    expect(listTrashResult.children.some(({ id }) => id === createItemResult.id)).toBeTruthy();
  });

  describe("deleting a file uploaded by an anonymous user should go to the sharers trash", () => {
    async function getCurrentUsersTrashContentIds() {
      const listTrashResponse = await currentUser.getDocument("trash");
      expect(listTrashResponse.statusCode).toBe(200);
      const listTrashResult = deserialize<DriveItemDetailsMockClass>(
        DriveItemDetailsMockClass,
        listTrashResponse.body,
      );
      return listTrashResult.children.map(({id}) => id);
    }

    it("finds the owner from the immediate parent folder", async () => {
      const publiclyWriteableFolder = await currentUser.createDirectory();
      const setPublicWriteableResponse = await currentUser.shareWithPublicLink(publiclyWriteableFolder, "write");
      expect(setPublicWriteableResponse.statusCode).toBe(200);

      const anonymouslyUploadedDoc = await currentUser.impersonatePublicLinkAccessOf(publiclyWriteableFolder, () =>
        currentUser.createDefaultDocument({
          parent_id: publiclyWriteableFolder.id,
        }));
      expect(publiclyWriteableFolder.creator).toEqual(currentUser.user.id);
      expect(anonymouslyUploadedDoc.creator).not.toEqual(currentUser.user.id);

      const deletionToTrashResponse = await currentUser.delete(anonymouslyUploadedDoc.id);
      expect(deletionToTrashResponse.statusCode).toBe(200);

      expect((await getCurrentUsersTrashContentIds())).toContain(anonymouslyUploadedDoc.id);
    });

    it("finds the owner from the indirect parent folder", async () => {
      const publiclyWriteableFolder = await currentUser.createDirectory();
      const setPublicWriteableResponse = await currentUser.shareWithPublicLink(publiclyWriteableFolder, "write");
      expect(setPublicWriteableResponse.statusCode).toBe(200);

      const anonymouslyUploadedDoc = await currentUser.impersonatePublicLinkAccessOf(publiclyWriteableFolder, async () => {
        const anonymouslyCreatedFolder = await currentUser.createDirectory(publiclyWriteableFolder.id);
        expect(anonymouslyCreatedFolder.creator).not.toEqual(currentUser.user.id);
        return currentUser.createDefaultDocument({
          parent_id: anonymouslyCreatedFolder.id,
        })
      });
      expect(publiclyWriteableFolder.creator).toEqual(currentUser.user.id);
      expect(anonymouslyUploadedDoc.creator).not.toEqual(currentUser.user.id);

      const deletionToTrashResponse = await currentUser.delete(anonymouslyUploadedDoc.id);
      expect(deletionToTrashResponse.statusCode).toBe(200);

      expect((await getCurrentUsersTrashContentIds())).toContain(anonymouslyUploadedDoc.id);
    });

    it.only("goes into the sharers trash even if another user deletes the file", async () => {
      const publiclyWriteableFolder = await currentUser.createDirectory();
      const setPublicWriteableResponse = await currentUser.shareWithPublicLink(publiclyWriteableFolder, "write");
      expect(setPublicWriteableResponse.statusCode).toBe(200);

      const anonymouslyUploadedDoc = await currentUser.impersonatePublicLinkAccessOf(publiclyWriteableFolder, () =>
        currentUser.createDefaultDocument({
          parent_id: publiclyWriteableFolder.id,
        }));

      const secondaryUser = await UserApi.getInstance(platform!);

      const deletionToTrashResponse = await secondaryUser.delete(anonymouslyUploadedDoc.id);
      expect(deletionToTrashResponse.statusCode).toBe(200);

      expect((await getCurrentUsersTrashContentIds())).toContain(anonymouslyUploadedDoc.id);
    });

    it("If anonymous user deletes the files in should be in the users trash", async () => {
      const publiclyWriteableFolder = await currentUser.createDirectory();
      const anonymousUser  = await UserApi.getInstance(platform);

      const setPublicWriteableResponse = await currentUser.shareWithPublicLink(publiclyWriteableFolder, "manage");
      expect(setPublicWriteableResponse.statusCode).toBe(200);

      anonymousUser.jwt = (await anonymousUser.getPublicLinkAccessToken(publiclyWriteableFolder)).value;
      const anonymouslyUploadedDoc = await anonymousUser.uploadRandomFileAndCreateDocument(publiclyWriteableFolder.id);

      const deletionToTrashResponse = await anonymousUser.delete(anonymouslyUploadedDoc.id);
      expect(deletionToTrashResponse.statusCode).toBe(200);

      expect((await getCurrentUsersTrashContentIds())).toContain(anonymouslyUploadedDoc.id);
    });
  });
});